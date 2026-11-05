import * as oidc from 'openid-client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HttpError, parse } from '../validation.mjs';
import { seal, unseal, digest, checkSecondFactor } from '../security.mjs';
import { transaction } from '../db.mjs';
import { audit } from '../domain.mjs';

export function configuredOidc({ issuer, clientId, clientSecret, redirectUri }) {
  if (!issuer || !clientId || !clientSecret) return null;
  if (new URL(issuer).protocol !== 'https:') throw new Error('OIDC_ISSUER must use HTTPS.');
  let configuration;
  const getConfig = () =>
    (configuration ||= oidc.discovery(new URL(issuer), clientId, clientSecret).catch((error) => {
      configuration = null;
      throw error;
    }));
  return {
    async start({ state, nonce, verifier }) {
      const config = await getConfig();
      return oidc.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        response_type: 'code',
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
      }).href;
    },
    async finish(url, { state, nonce, verifier }) {
      const config = await getConfig();
      const tokens = await oidc.authorizationCodeGrant(config, url, {
        pkceCodeVerifier: verifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      return { ...claims, iss: config.serverMetadata().issuer };
    },
  };
}
export function ssoRoutes(
  app,
  { pool, key, siteUrl, issue, limiter, production, provider, domains = [] },
) {
  app.get('/api/auth/providers', (_req, res) => res.json({ ssoEnabled: !!provider }));
  const cookie = {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/api/auth/sso',
    maxAge: 5 * 60000,
  };
  app.get('/api/auth/sso/start', limiter, async (_req, res) => {
    if (!provider) throw new HttpError(503, 'Organization sign-in is not configured.');
    const state = randomBytes(32).toString('base64url');
    const verifier = oidc.randomPKCECodeVerifier(),
      nonce = oidc.randomNonce();
    const flow = { state, verifier, nonce, expiresAt: Date.now() + 5 * 60000 };
    const url = await provider.start(flow);
    res.cookie('venue_sso_flow', seal(JSON.stringify(flow), key), cookie);
    res.redirect(url);
  });
  app.get('/api/auth/sso/callback', limiter, async (req, res) => {
    if (!provider) throw new HttpError(503, 'Organization sign-in is not configured.');
    const encrypted = req.cookies.venue_sso_flow;
    res.clearCookie('venue_sso_flow', { ...cookie, maxAge: undefined });
    try {
      const flow = JSON.parse(unseal(encrypted, key));
      if (flow.expiresAt < Date.now() || req.query.state !== flow.state)
        throw new Error('Invalid flow');
      const claims = await provider.finish(new URL(req.originalUrl, siteUrl), flow);
      if (!claims.sub || !claims.iss || claims.email_verified !== true || !claims.email)
        throw new Error('Verified identity required');
      const email = String(claims.email).toLowerCase();
      if (domains.length && !domains.includes(email.split('@')[1]))
        throw new Error('Domain is not allowed');
      const user = await transaction(pool, async (db) => {
        const linked = (
          await db.query(
            'SELECT user_id FROM venue_app.sso_identities WHERE issuer=$1 AND subject=$2',
            [claims.iss, claims.sub],
          )
        ).rows[0];
        const user = (
          await db.query(
            'SELECT * FROM venue_app.users WHERE ' +
              (linked ? 'id=$1' : 'email=$1') +
              ' AND active=true FOR UPDATE',
            [linked ? linked.user_id : email],
          )
        ).rows[0];
        if (!user) throw new Error('Account must be provisioned first');
        if (!linked) {
          if (
            (
              await db.query(
                'SELECT subject FROM venue_app.sso_identities WHERE issuer=$1 AND user_id=$2',
                [claims.iss, user.id],
              )
            ).rowCount
          )
            throw new Error('Identity mismatch');
          await db.query(
            'INSERT INTO venue_app.sso_identities(issuer,subject,user_id) VALUES($1,$2,$3)',
            [claims.iss, claims.sub, user.id],
          );
        }
        await db.query(
          'UPDATE venue_app.users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1',
          [user.id],
        );
        await audit(db, user, 'sso.authenticated', user.id);
        return user;
      });
      if (user.mfa_secret) {
        const token = randomBytes(32).toString('base64url');
        await pool.query(
          "INSERT INTO venue_app.sso_challenges(token_hash,user_id,session_version,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')",
          [digest(token), user.id, user.session_version],
        );
        res.cookie('venue_sso_challenge', token, cookie);
        return res.redirect(siteUrl + '/login?sso=mfa');
      }
      await issue(req, res, user);
      res.redirect(siteUrl + (user.role === 'admin' ? '/admin' : '/dashboard'));
    } catch {
      res.redirect(siteUrl + '/login?sso=error');
    }
  });
  app.post('/api/auth/sso/complete', limiter, async (req, res) => {
    const v = parse(z.object({ code: z.string().trim().min(1).max(40) }).strict(), req.body);
    const token = req.cookies.venue_sso_challenge;
    if (!token) throw new HttpError(401, 'Start organization sign-in again.');
    const user = await transaction(pool, async (db) => {
      const challenge = (
        await db.query(
          'SELECT * FROM venue_app.sso_challenges WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',
          [digest(token)],
        )
      ).rows[0];
      if (!challenge) throw new HttpError(401, 'Start organization sign-in again.');
      const user = (
        await db.query('SELECT * FROM venue_app.users WHERE id=$1 AND active=true FOR UPDATE', [
          challenge.user_id,
        ])
      ).rows[0];
      if (!user || user.session_version !== challenge.session_version)
        throw new HttpError(401, 'Start organization sign-in again.');
      await checkSecondFactor(db, user, v.code, key);
      await db.query('UPDATE venue_app.sso_challenges SET used_at=now() WHERE token_hash=$1', [
        digest(token),
      ]);
      return user;
    });
    await issue(req, res, user);
    res.clearCookie('venue_sso_challenge', { ...cookie, maxAge: undefined });
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        mfaEnabled: !!user.mfa_secret,
      },
    });
  });
}
