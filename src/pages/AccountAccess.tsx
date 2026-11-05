import { useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../lib/api';
import { Button } from '../components/ui/button';
import { SaveForm, str } from '../features/workspace/Forms';

export default function AccountAccess() {
  const [link] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const purpose = link.get('purpose'),
    token = link.get('token');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="auth-page account-access-page">
      <div className="auth-form-wrap">
        <span className="workspace-kicker">ACCOUNT ACCESS</span>
        <h1>
          {purpose === 'verify'
            ? 'Verify your email.'
            : token
              ? 'Choose a new password.'
              : 'Reset your password.'}
        </h1>
        {done ? (
          <p role="status">
            {token
              ? 'Your account has been updated. You can sign in.'
              : 'If your account is eligible, a reset link will arrive by email. Check your inbox.'}
          </p>
        ) : purpose === 'verify' && token ? (
          <>
            <p>Confirm this email address belongs to you.</p>
            <Button
              variant="dark"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await request('/auth/verify-email', {
                    method: 'POST',
                    body: JSON.stringify({ token }),
                  });
                  setDone(true);
                  history.replaceState(null, '', location.pathname);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Verify email address
            </Button>
          </>
        ) : token ? (
          <SaveForm
            label="Reset password"
            fields={[
              { name: 'password', label: 'New password', type: 'password', required: true },
              {
                name: 'code',
                label: 'Authenticator or recovery code',
                hint: 'Required if two-factor authentication is enabled on your account.',
              },
            ]}
            onSave={async (data) => {
              await request('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({
                  token,
                  password: String(data.get('password')),
                  code: str(data, 'code'),
                }),
              });
              setDone(true);
              history.replaceState(null, '', location.pathname);
            }}
          />
        ) : (
          <>
            <p>Enter your account email. We’ll send an expiring link to choose a new password.</p>
            <SaveForm
              label="Send reset link"
              fields={[{ name: 'email', label: 'Email address', type: 'email', required: true }]}
              onSave={async (data) => {
                await request('/auth/forgot-password', {
                  method: 'POST',
                  body: JSON.stringify({ email: str(data, 'email') }),
                });
                setDone(true);
              }}
            />
          </>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <p>
          <Link to="/login">Return to sign in</Link>
        </p>
      </div>
    </section>
  );
}
