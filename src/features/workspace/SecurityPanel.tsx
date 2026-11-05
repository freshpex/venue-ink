import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { request, download } from '../../lib/api';
import { useApi, useRefresh, dateTime } from '../../lib/queries';
import { Loading, Failure } from '../../components/AsyncState';
import { Button } from '../../components/ui/button';
import { SaveForm, str, checked } from './Forms';

type SecurityData = {
  emailVerified: boolean;
  mfaEnabled: boolean;
  emailNotifications: boolean;
  requireStaffMfa: boolean;
  sessions: {
    id: string;
    user_agent: string;
    created_at: string;
    expires_at: string;
    current: boolean;
  }[];
};
export function SecurityPanel() {
  const query = useApi<SecurityData>('/security');
  const privacy = useApi<{
    requests: { id: string; kind: string; status: string; resolution: string }[];
  }>('/account/privacy-requests');
  const refresh = useRefresh();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  const security = query.data;
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      void refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-columns">
      <section className="workspace-card">
        <h2>Two-factor authentication</h2>
        <p>
          {security.mfaEnabled
            ? 'Your password and authenticator protect your account.'
            : 'Add a six-digit code from an authenticator app to protect sign-in.'}
        </p>
        {security.requireStaffMfa && (
          <p role="status">
            Your organization requires two-factor authentication for staff access.
          </p>
        )}
        {codes.length > 0 && (
          <div className="recovery-codes" role="status">
            <h3>Save your recovery codes now</h3>
            <p>Each code works once. Keep them somewhere private; they will not be shown again.</p>
            <pre>{codes.join('\n')}</pre>
            <Button
              variant="outline"
              onClick={() => {
                setCodes([]);
              }}
            >
              I saved these codes
            </Button>
          </div>
        )}
        {!security.mfaEnabled ? (
          setup ? (
            <>
              <p>
                In your authenticator, add an account using this setup key. Then enter its current
                code below.
              </p>
              <code className="secret-key">{setup.secret}</code>
              <SaveForm
                label="Enable two-factor authentication"
                fields={[{ name: 'code', label: 'Authenticator code', required: true }]}
                onSave={async (data) => {
                  const result = await request<{ recoveryCodes: string[] }>(
                    '/security/mfa/confirm',
                    { method: 'POST', body: JSON.stringify({ code: str(data, 'code') }) },
                  );
                  setCodes(result.recoveryCodes);
                  setSetup(null);
                  void client.invalidateQueries({ queryKey: ['session'] });
                }}
              />
            </>
          ) : (
            <SaveForm
              label="Set up authenticator"
              fields={[
                {
                  name: 'password',
                  label: 'Confirm your password',
                  type: 'password',
                  required: true,
                },
              ]}
              onSave={async (data) =>
                setSetup(
                  await request('/security/mfa/setup', {
                    method: 'POST',
                    body: JSON.stringify({ password: String(data.get('password')) }),
                  }),
                )
              }
            />
          )
        ) : (
          !security.requireStaffMfa && (
            <SaveForm
              label="Disable two-factor authentication"
              fields={[
                {
                  name: 'password',
                  label: 'Confirm your password',
                  type: 'password',
                  required: true,
                },
                { name: 'code', label: 'Authenticator or recovery code', required: true },
              ]}
              onSave={async (data) => {
                await request('/security/mfa/disable', {
                  method: 'POST',
                  body: JSON.stringify({
                    password: String(data.get('password')),
                    code: str(data, 'code'),
                  }),
                });
                setCodes([]);
                void client.invalidateQueries({ queryKey: ['session'] });
              }}
            />
          )
        )}
      </section>
      <section className="workspace-card">
        <h2>Email & notifications</h2>
        <p>
          {security.emailVerified
            ? 'Your email address is verified.'
            : 'Verify your email to confirm that you control this address.'}
        </p>
        {!security.emailVerified && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await request('/security/verify-email', { method: 'POST', body: '{}' });
                toast.success('Verification requested. Check your email.');
              })
            }
          >
            Send verification email
          </Button>
        )}
        <SaveForm
          key={String(security.emailNotifications)}
          fields={[
            {
              name: 'email',
              label: 'Email me booking updates and reminders',
              type: 'checkbox',
              value: security.emailNotifications,
            },
          ]}
          onSave={(data) =>
            request('/security/preferences', {
              method: 'PATCH',
              body: JSON.stringify({ emailNotifications: checked(data, 'email') }),
            })
          }
        />
        <p className="fine-print">
          Security emails remain available when booking emails are turned off. Delivery requires a
          configured email provider.
        </p>
      </section>
      <section className="workspace-card">
        <h2>Signed-in devices</h2>
        <p>Revoke a device you no longer use. Changing your password ends previous sessions.</p>
        {security.sessions.map((s) => (
          <div className="entity-row" key={s.id}>
            <span>
              <strong>{s.current ? 'This device' : 'Other device'}</strong>
              <small className="wrap-anywhere">{s.user_agent}</small>
              <small>Signed in {dateTime(s.created_at)}</small>
            </span>
            <Button
              variant="outline"
              size="small"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await request('/security/sessions/' + s.id, { method: 'DELETE' });
                  if (s.current) {
                    client.clear();
                    navigate('/login');
                  }
                })
              }
            >
              Sign out device
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            action(async () => {
              await request('/security/revoke-all', { method: 'POST', body: '{}' });
              client.clear();
              navigate('/login');
            })
          }
        >
          Sign out all devices
        </Button>
      </section>
      <section className="workspace-card">
        <h2>Your data & privacy</h2>
        <p>
          Download your account records. Image metadata is included; your original images remain
          available in My account.
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => action(() => download('/account/export', 'venue-account.json'))}
        >
          Download my account data
        </Button>
        <p>
          Request a correction or erasure review. Staff will explain any records that must be
          retained.
        </p>
        <SaveForm
          label="Submit privacy request"
          fields={[
            {
              name: 'kind',
              label: 'Request type',
              type: 'select',
              options: [
                { value: 'correction', label: 'Correct my information' },
                { value: 'erasure', label: 'Request data erasure' },
              ],
            },
            { name: 'reason', label: 'What should we review?', type: 'textarea', required: true },
          ]}
          onSave={(data) =>
            request('/account/privacy-requests', {
              method: 'POST',
              body: JSON.stringify({ kind: str(data, 'kind'), reason: str(data, 'reason') }),
            })
          }
        />
        {privacy.data?.requests.map((r) => (
          <div className="entity-row" key={r.id}>
            <span>
              <strong>
                {r.kind} · {r.status.replace('_', ' ')}
              </strong>
              {r.resolution && <small>{r.resolution}</small>}
            </span>
          </div>
        ))}
        {privacy.isError && <Failure message={privacy.error.message} />}
      </section>
    </div>
  );
}
