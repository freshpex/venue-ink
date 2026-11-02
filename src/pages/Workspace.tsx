import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Eye, EyeOff, LoaderCircle, PenTool } from 'lucide-react';
import { request, waitForServer } from '../lib/api';
import { useSession } from '../lib/queries';
import type { User } from '../lib/types';
import { Button } from '../components/ui/button';
import { Label, Photo } from '../components/Primitives';
import { toast } from 'sonner';
const fields = z.object({
  name: z.string().max(100),
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(128),
  role: z.enum(['client', 'artist', 'studio']),
});
type Fields = z.infer<typeof fields>;
export function WorkspaceLogin() {
  const location = useLocation();
  const signup = location.pathname.endsWith('register');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useSession();
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const roleParam = params.get('role');
  const {
    register,
    handleSubmit,
    setError: fieldError,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({
    resolver: zodResolver(fields),
    defaultValues: {
      name: '',
      role: roleParam === 'artist' || roleParam === 'studio' ? roleParam : 'client',
    },
  });
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (session.data){const next=params.get('next');navigate(next&&next.startsWith('/')&&!next.startsWith('//')?next:session.data.role === 'admin' ? '/admin' : '/dashboard', { replace: true });}
  }, [session.data, navigate,params]);
  return (
    <section className="auth-page">
      <div className="auth-photo">
        <Photo name="artist-at-work" alt="An artist concentrating on their work" eager />
        <div>
          <Label light>MAKE ROOM FOR THE ART</Label>
          <h2>
            Your work.
            <br />
            Your people.
            <br />
            Your Venue.
          </h2>
          <span className="auth-photo-mark">
            <PenTool size={48} />
          </span>
        </div>
      </div>
      <div className="auth-form-wrap">
        <span className="workspace-kicker">YOUR VENUE ACCOUNT</span>
        <h1>{signup ? 'A fresh canvas.' : 'Welcome back.'}</h1>
        <p>
          {signup
            ? 'Create your space for bookings, conversations and the work ahead.'
            : 'Your books, your people and your next great piece. All right here.'}
        </p>
        <form
          onSubmit={handleSubmit(async (values) => {
            if (signup && values.name.trim().length < 2) {
              fieldError('name', { message: 'Enter your name' });
              return;
            }
            if (signup && values.password.length < 8) {
              fieldError('password', { message: 'Use at least 8 characters' });
              return;
            }
            setError('');
            controller.current?.abort();
            const abort = new AbortController();
            controller.current = abort;
            try {
              await waitForServer(setStatus, abort.signal);
              setStatus(signup ? 'Creating your account…' : 'Signing you in…');
              const response = await request<{ user: User }>(
                signup ? '/auth/register' : '/auth/login',
                {
                  method: 'POST',
                  body: JSON.stringify(
                    signup
                      ? {
                          ...values,
                          ...(params.get('invite') ? { invitation: params.get('invite') } : {}),
                        }
                      : { email: values.email, password: values.password },
                  ),
                },
                abort.signal,
              );
              client.setQueryData(['session'], response.user);
              const next = params.get('next');
              toast.success(signup ? 'Your account is ready' : 'Welcome back');
              navigate(
                next && next.startsWith('/') && !next.startsWith('//')
                  ? next
                  : response.user.role === 'admin'
                    ? '/admin'
                    : '/dashboard',
                { replace: true },
              );
            } catch (error) {
              if (!abort.signal.aborted) setError((error as Error).message);
            } finally {
              setStatus('');
            }
          })}
        >
          {signup && (
            <>
              <label>
                Your name
                <input {...register('name')} autoComplete="name" required minLength={2} />
                {errors.name && <span className="field-error">{errors.name.message}</span>}
              </label>
              <label>
                I’m here as
                <select {...register('role')}>
                  <option value="client">A client</option>
                  <option value="artist">An artist</option>
                  <option value="studio">A studio owner</option>
                </select>
              </label>
            </>
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
                {...register('password')}
                aria-label="Password"
                type={visible ? 'text' : 'password'}
                autoComplete={signup ? 'new-password' : 'current-password'}
                aria-invalid={!!errors.password}
                aria-describedby="auth-password-error"
              />
              <button
                type="button"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                onClick={() => setVisible((value) => !value)}
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
          {!signup && (
            <Link className="password-help" to="/contact?type=Account%20access">
              Need help signing in?
            </Link>
          )}
          {error && (
            <p className="auth-error" role="alert">
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
                {signup ? 'Create my account' : 'Sign in'}
                <ArrowUpRight size={18} />
              </>
            )}
          </Button>
          {isSubmitting && (
            <>
              <p className="fine-print" role="status">
                We’re connecting to the server. Your information stays here while it starts.
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
            {signup ? 'Already have an account?' : 'New around here?'}{' '}
            <Link to={signup ? '/login' : '/register'}>
              {signup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          {signup && (
            <p className="fine-print">
              By creating an account you agree to the <Link to="/terms">terms of service</Link> and{' '}
              <Link to="/privacy">privacy policy</Link>.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
