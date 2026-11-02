import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Eye, EyeOff, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { request, waitForServer, ApiError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Label, Photo, PageIntro } from '../components/Primitives';
import { links } from '../data/site';
import { toast } from 'sonner';
const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(12, 'Use at least 12 characters').max(128),
  name: z.string().max(100),
});
type LoginFields = z.infer<typeof schema>;
type User = {
  id: string;
  name: string;
  email: string;
  role: 'artist' | 'studio';
};
type SavedIdea = { id: string; title: string; created_at: string };
export function WorkspaceLogin() {
  const registerMode = useLocation().pathname.endsWith('register');
  const navigate = useNavigate();
  const client = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFields>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <section className="auth-page">
      <div className="auth-photo">
        <Photo name="artist-at-work" alt="An artist concentrating on a tattoo session" eager />
        <div>
          <Label light>A LITTLE MORE HEADSPACE</Label>
          <h2>
            Make room
            <br />
            for the art.
          </h2>
        </div>
      </div>
      <div className="auth-form-wrap">
        <span className="demo-badge">
          <i /> Independent preview workspace
        </span>
        <h1>{registerMode ? 'A fresh canvas.' : 'Welcome back.'}</h1>
        <p>
          {registerMode
            ? 'Create an account for this implementation’s private idea workspace.'
            : 'Sign in to this implementation’s private idea workspace.'}{' '}
          Existing Venue credentials belong on the <a href={links.login}>official Venue app ↗</a>.
        </p>
        <form
          onSubmit={handleSubmit(async (values) => {
            setError('');
            controller.current?.abort();
            const abort = new AbortController();
            controller.current = abort;
            try {
              await waitForServer(setStatus, abort.signal);
              setStatus(registerMode ? 'Creating your workspace…' : 'Signing you in…');
              const result = await request<{ user: User }>(
                registerMode ? '/auth/register' : '/auth/login',
                { method: 'POST', body: JSON.stringify(values) },
                abort.signal,
              );
              client.setQueryData(['me'], { user: result.user });
              toast.success(
                registerMode ? 'Preview workspace created' : 'Signed in to your preview workspace',
              );
              navigate('/workspace');
            } catch (e) {
              if (!abort.signal.aborted)
                setError(e instanceof Error ? e.message : 'Unable to connect. Please try again.');
            } finally {
              setStatus('');
            }
          })}
        >
          {registerMode && (
            <label>
              Your name
              <input
                {...register('name')}
                required
                minLength={2}
                autoComplete="name"
                maxLength={100}
              />
            </label>
          )}
          <label>
            Email address
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby="auth-email-error"
            />
            {errors.email && (
              <span className="field-error" id="auth-email-error">
                {errors.email.message}
              </span>
            )}
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                aria-label="Password"
                {...register('password')}
                type={visible ? 'text' : 'password'}
                autoComplete={registerMode ? 'new-password' : 'current-password'}
                aria-invalid={!!errors.password}
                aria-describedby="auth-password-error"
              />
              <button
                type="button"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.password && (
              <span className="field-error" id="auth-password-error">
                {errors.password.message}
              </span>
            )}
          </label>
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          <Button variant="dark" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <LoaderCircle size={18} className="spin" />
                {status || 'Connecting to server…'}
              </>
            ) : (
              <>
                {registerMode ? 'Create preview workspace' : 'Sign in to preview workspace'}
                <ArrowUpRight size={18} />
              </>
            )}
          </Button>
          {isSubmitting && (
            <>
              <p className="fine-print" role="status">
                Free Render servers can take a moment to wake up. We’ll submit once the server is
                ready. Keep this page open.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => controller.current?.abort()}
              >
                Cancel connection
              </button>
            </>
          )}
          <p>
            {registerMode ? 'Already have a preview account?' : 'New to this preview?'}{' '}
            <Link to={registerMode ? '/workspace/login' : '/workspace/register'}>
              {registerMode ? 'Sign in' : 'Create a workspace'}
            </Link>
          </p>
          <p className="fine-print">
            This workspace stores private idea titles only. It does not book clients or process
            payments. <Link to="/demo">Explore without an account</Link>.
          </p>
        </form>
      </div>
    </section>
  );
}
export function Workspace() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => request<{ user: User }>('/auth/me'),
    retry: false,
  });
  const ideas = useQuery({
    queryKey: ['ideas'],
    queryFn: () => request<{ ideas: SavedIdea[] }>('/ideas'),
    enabled: !!me.data,
    retry: false,
  });
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401)
      navigate('/workspace/login', { replace: true });
  }, [me.error, navigate]);
  if (me.isPending)
    return (
      <div className="page-loading" role="status">
        <LoaderCircle className="spin" /> Opening your workspace…
      </div>
    );
  if (me.isError)
    return (
      <section className="container empty-state">
        <h1>Your workspace couldn’t connect.</h1>
        <p>{me.error.message}</p>
        <Button onClick={() => me.refetch()}>Try again</Button>
        <Link to="/workspace/login">Return to sign in</Link>
      </section>
    );
  return (
    <>
      <PageIntro
        label="YOUR PRIVATE PREVIEW WORKSPACE"
        title={`A little space for ${me.data.user.name}.`}
        text="Save private idea titles to this implementation’s Node.js backend. These are not Venue booking records."
      />
      <section className="container private-workspace">
        <div className="workspace-session">
          <span>
            <ShieldCheck size={18} /> Signed in as {me.data.user.email}
          </span>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await request('/auth/logout', { method: 'POST' });
                client.clear();
                navigate('/workspace/login');
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <LogOut size={17} /> Sign out
          </Button>
        </div>
        <form
          className="idea-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            setSaving(true);
            try {
              await request('/ideas', {
                method: 'POST',
                body: JSON.stringify({ title: title.trim() }),
              });
              setTitle('');
              await client.invalidateQueries({ queryKey: ['ideas'] });
              toast.success('Idea saved to your private workspace');
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Your next idea
            <input
              value={title}
              required
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Botanical collection for the next flash day"
            />
          </label>
          <Button disabled={saving} variant="dark">
            {saving ? 'Saving…' : 'Save idea'}
            <ArrowUpRight size={17} />
          </Button>
        </form>
        {ideas.isPending ? (
          <p role="status">Loading your ideas…</p>
        ) : ideas.isError ? (
          <div role="alert">
            <p>{ideas.error.message}</p>
            <Button onClick={() => ideas.refetch()}>Retry</Button>
          </div>
        ) : !ideas.data?.ideas.length ? (
          <div className="empty-state">
            <h2>A fresh page.</h2>
            <p>Save your first idea above.</p>
          </div>
        ) : (
          <div className="saved-ideas">
            {ideas.data.ideas.map((idea) => (
              <article key={idea.id}>
                <h2>{idea.title}</h2>
                <small>Saved {new Date(idea.created_at).toLocaleDateString('en-US')}</small>
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await request(`/ideas/${idea.id}`, { method: 'DELETE' });
                      await client.invalidateQueries({ queryKey: ['ideas'] });
                      toast('Idea removed');
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
