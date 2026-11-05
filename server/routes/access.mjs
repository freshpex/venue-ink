import { z } from 'zod';
import { parse, id, email, HttpError } from '../validation.mjs';
import { audit } from '../domain.mjs';
import { transaction } from '../db.mjs';

export function accessRoutes(app, { pool }) {
  app.get('/api/team/access', async (req, res) => {
    if (req.user.role === 'client') throw new HttpError(403, 'A staff account is required.');
    const studios = (
      await pool.query(
        'SELECT id,name FROM venue_app.studios WHERE owner_id=$1 OR $2=true ORDER BY name',
        [req.user.id, req.user.role === 'admin'],
      )
    ).rows;
    const grants = (
      await pool.query(
        'SELECT sa.studio_id,sa.user_id,sa.access_role,u.name,u.email,st.name AS studio_name FROM venue_app.studio_access sa JOIN venue_app.studios st ON st.id=sa.studio_id JOIN venue_app.users u ON u.id=sa.user_id WHERE st.owner_id=$1 OR $2=true ORDER BY st.name,u.name',
        [req.user.id, req.user.role === 'admin'],
      )
    ).rows;
    res.json({ studios, grants });
  });
  app.put('/api/team/access', async (req, res) => {
    const v = parse(
      z
        .object({ studioId: id, email, accessRole: z.enum(['manager', 'receptionist', 'finance']) })
        .strict(),
      req.body,
    );
    await transaction(pool, async (db) => {
      const studio = (
        await db.query('SELECT owner_id FROM venue_app.studios WHERE id=$1 FOR UPDATE', [
          v.studioId,
        ])
      ).rows[0];
      if (
        !studio ||
        (req.user.role !== 'admin' && studio.owner_id !== req.user.id) ||
        req.user.role === 'client'
      )
        throw new HttpError(403, 'Only the studio owner or an administrator can delegate access.');
      const user = (
        await db.query('SELECT id,role,active FROM venue_app.users WHERE email=$1 FOR UPDATE', [
          v.email,
        ])
      ).rows[0];
      if (!user || !user.active || user.role === 'client')
        throw new HttpError(400, 'Choose an active artist or studio staff account.');
      if (user.id === studio.owner_id || user.role === 'admin')
        throw new HttpError(400, 'This account already has full access.');
      await db.query(
        'INSERT INTO venue_app.studio_access(studio_id,user_id,access_role,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT(studio_id,user_id) DO UPDATE SET access_role=excluded.access_role,granted_by=excluded.granted_by',
        [v.studioId, user.id, v.accessRole, req.user.id],
      );
      await audit(db, req.user, 'studio.access_granted', user.id, {
        studioId: v.studioId,
        accessRole: v.accessRole,
      });
    });
    res.json({ ok: true });
  });
  app.delete('/api/team/access/:studioId/:userId', async (req, res) => {
    const studioId = parse(id, req.params.studioId),
      userId = parse(id, req.params.userId);
    await transaction(pool, async (db) => {
      const studio = (
        await db.query('SELECT owner_id FROM venue_app.studios WHERE id=$1 FOR UPDATE', [studioId])
      ).rows[0];
      if (
        !studio ||
        (req.user.role !== 'admin' && studio.owner_id !== req.user.id) ||
        req.user.role === 'client'
      )
        throw new HttpError(403, 'Only the studio owner or an administrator can revoke access.');
      await db.query('DELETE FROM venue_app.studio_access WHERE studio_id=$1 AND user_id=$2', [
        studioId,
        userId,
      ]);
      await audit(db, req.user, 'studio.access_revoked', userId, { studioId });
    });
    res.json({ ok: true });
  });
}
