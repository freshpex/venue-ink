import { SecurityPanel } from '../features/workspace/SecurityPanel';
import {
  OperationsPanel,
  AccessPanel,
  ReportsPanel,
  PrivacyPanel,
  Pagination,
} from '../features/workspace/OperationsPanel';
import type { PageData } from '../features/workspace/OperationsPanel';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, LogOut, CalendarDays, PenTool } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Loading, Failure, Empty } from '../components/AsyncState';
import { useApi, useSession, useRefresh, dateTime, money } from '../lib/queries';
import { request } from '../lib/api';
import type { ProfileData } from '../features/workspace/AccountPanel';
import type { Booking, Payment, Notification } from '../lib/types';
import { AccountPanel, AvailabilityPanel } from '../features/workspace/AccountPanel';
import {
  StudioSettings,
  ServicesPanel,
  TeamPanel,
  ArtworkPanel,
  EventsPanel,
} from '../features/workspace/Management';
import {
  AdminOverview,
  AdminArtists,
  UsersPanel,
  SupportPanel,
  ArticlesPanel,
  SiteSettings,
  AuditPanel,
} from '../features/workspace/AdminPanel';
import { SaveForm, str, cents } from '../features/workspace/Forms';
function BookingList({ calendar = false }: { calendar?: boolean }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const query = useApi<{ bookings: Booking[]; pagination: PageData }>(
    '/bookings-search?' +
      new URLSearchParams({
        page: String(page),
        ...(search ? { search } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(calendar ? { month } : {}),
      }),
    { interval: 30000 },
  );
  const items =
    query.data?.bookings
      .filter(
        (b) =>
          (status === 'all' || b.status === status) &&
          (!calendar || b.starts_at.slice(0, 7) === month),
      )
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)) || [];
  return (
    <section className="workspace-card">
      <div className="section-heading">
        <h2>{calendar ? 'Room in your calendar.' : 'Your bookings.'}</h2>
        <div className="workspace-filters">
          <input
            aria-label="Search bookings"
            placeholder="Client, artist, studio or request"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {calendar && (
            <label>
              Month
              <input
                aria-label="Calendar month"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          )}
          <select
            aria-label="Booking status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {['all', 'pending', 'confirmed', 'completed', 'declined', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All statuses' : s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : !items.length ? (
        <Empty
          title="Space for what comes next."
          text="Your requests and appointments will appear here."
          to="/booking"
          action="Make a booking"
        />
      ) : (
        <div className={calendar ? 'calendar-agenda' : 'booking-list'}>
          {items.map((b) => (
            <Link className="entity-row booking-row" key={b.id} to={'/bookings/' + b.id}>
              <span className="calendar-date">
                <b>{new Date(b.starts_at).getDate()}</b>
                <small>
                  {new Date(b.starts_at).toLocaleDateString('en-US', { month: 'short' })}
                </small>
              </span>
              <span>
                <strong>{b.title}</strong>
                <small>
                  {b.client_name} · {b.artist_name} · {b.studio_name}
                </small>
                <small>{dateTime(b.starts_at, b.timezone)}</small>
              </span>
              <span className={'status status-' + b.status}>{b.status}</span>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      )}
      <Pagination data={query.data?.pagination} onPage={setPage} />
    </section>
  );
}
function Overview() {
  const query = useApi<{ stats: Record<string, number> }>('/dashboard');
  const notices = useApi<{ notifications: Notification[] }>('/notifications', { interval: 30000 });
  const refresh = useRefresh();
  return (
    <>
      <div className="workspace-stats">
        {Object.entries(query.data?.stats || {}).map(([key, value]) => (
          <div key={key}>
            <strong>{value}</strong>
            <span>{key === 'total' ? 'Bookings' : key === 'unread' ? 'Unread updates' : key}</span>
          </div>
        ))}
      </div>
      {query.isError && <Failure message={query.error.message} />}
      <section className="workspace-card">
        <h2>A little heads-up.</h2>
        {notices.isPending ? (
          <Loading />
        ) : notices.isError ? (
          <Failure message={notices.error.message} />
        ) : notices.data.notifications.length ? (
          notices.data.notifications.map((n) => (
            <div
              className={'entity-row notification-row ' + (n.read_at ? 'read' : 'unread')}
              key={n.id}
            >
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{dateTime(n.created_at)}</small>
                {n.booking_id && (
                  <Link className="arrow-link" to={'/bookings/' + n.booking_id}>
                    Open booking ↗
                  </Link>
                )}
              </div>
              {!n.read_at && (
                <Button
                  size="small"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await request('/notifications/' + n.id, { method: 'PATCH', body: '{}' });
                      refresh();
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }}
                >
                  Mark read
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="You’re all caught up."
            text="Updates about your bookings and conversations will appear here."
          />
        )}
      </section>
    </>
  );
}
function PaymentsPanel({ staff }: { staff: boolean }) {
  const query = useApi<{ payments: Payment[] }>('/payments');
  return (
    <section className="workspace-card">
      <h2>The payment picture.</h2>
      <p>Review your payment history and booking balances here.</p>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : query.data.payments.length ? (
        query.data.payments.map((payment) => (
          <details className="entity-details" key={payment.id}>
            <summary>
              <strong>
                {payment.reference} · {payment.method}
              </strong>
              <span>
                {money(payment.amount_cents, payment.currency)} · {payment.status}
              </span>
            </summary>
            <p>
              {payment.title} · {payment.purpose}
            </p>
            {payment.can_open_booking !== false && (
              <Link className="arrow-link" to={'/bookings/' + payment.booking_id}>
                Open booking ↗
              </Link>
            )}
            {payment.receipt_reference && <p>Receipt: {payment.receipt_reference}</p>}
            {!!payment.refunded_cents && (
              <p>Refunded: {money(payment.refunded_cents, payment.currency)}</p>
            )}
            {staff && payment.status === 'requested' && (
              <SaveForm
                fields={[
                  {
                    name: 'status',
                    label: 'Record verified outcome',
                    type: 'select',
                    options: [
                      { value: 'received', label: 'Funds verified as received' },
                      { value: 'cancelled', label: 'Cancel payment enquiry' },
                    ],
                  },
                  {
                    name: 'amount',
                    label: 'Amount received in USD',
                    type: 'number',
                    value: payment.amount_cents === null ? '' : payment.amount_cents / 100,
                    min: 0.01,
                    step: '0.01',
                    hint: 'Required when recording received funds. Leave empty to cancel an unquoted enquiry.',
                  },
                  { name: 'receipt', label: 'Receipt or transaction reference', required: true },
                ]}
                label="Record payment outcome"
                onSave={(data) =>
                  request('/payments/' + payment.id, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      status: str(data, 'status'),
                      ...(cents(data, 'amount') === null
                        ? {}
                        : { amountCents: cents(data, 'amount') }),
                      receiptReference: str(data, 'receipt'),
                    }),
                  })
                }
              />
            )}
          </details>
        ))
      ) : (
        <Empty
          title="The records start here."
          text="Open a booking to arrange payment. Your chosen method and the received-payment record will appear here."
        />
      )}
    </section>
  );
}
function IdeasPanel() {
  const query = useApi<{ ideas: { id: string; title: string }[] }>('/ideas');
  const refresh = useRefresh();
  return (
    <section className="workspace-card">
      <h2>Keep a good idea close.</h2>
      <SaveForm
        fields={[{ name: 'title', label: 'A thought for your next piece', required: true }]}
        label="Save my idea"
        onSave={(data) =>
          request('/ideas', { method: 'POST', body: JSON.stringify({ title: str(data, 'title') }) })
        }
      />
      {query.data?.ideas.map((idea) => (
        <div className="entity-row" key={idea.id}>
          <span>{idea.title}</span>
          <Button
            variant="outline"
            size="small"
            onClick={async () => {
              try {
                await request('/ideas/' + idea.id, { method: 'DELETE' });
                refresh();
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            Remove idea
          </Button>
        </div>
      ))}
      {query.isError && <Failure message={query.error.message} />}
    </section>
  );
}
export default function Dashboard() {
  const session = useSession();
  const security = useApi<{ requireStaffMfa: boolean; mfaEnabled: boolean }>('/security', {
    enabled: !!session.data,
  });
  const workspace = useApi<ProfileData>('/profile', {
    enabled: !!session.data && session.data.role !== 'client',
  });
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  if (session.isPending) return <Loading text="Connecting to your account…" />;
  if (session.isError)
    return <Failure message={session.error.message} retry={() => session.refetch()} />;
  if (!session.data)
    return (
      <Navigate
        to={'/login?next=' + encodeURIComponent(location.pathname + location.search)}
        replace
      />
    );
  const user = session.data;
  const admin = user.role === 'admin';
  const staff = user.role !== 'client';
  if (location.pathname === '/admin' && !admin) return <Navigate to="/dashboard" replace />;
  const tabs =
    security.data?.requireStaffMfa && !security.data.mfaEnabled
      ? [['security', 'Security']]
      : admin
        ? [
            ['overview', 'Platform overview'],
            ['users', 'Accounts & access'],
            ['artists', 'Artists'],
            ['studio', 'Studios'],
            ['services', 'Services'],
            ['team', 'Teams & invitations'],
            ['access', 'Studio permissions'],
            ['events', 'Events'],
            ['bookings', 'All bookings & messages'],
            ['calendar', 'Booking calendar'],
            ['payments', 'Payment verification'],
            ['inbox', 'Support inbox'],
            ['journal', 'Journal'],
            ['settings', 'Site settings'],
            ['audit', 'Activity log'],
            ['operations', 'Operations'],
            ['reports', 'Reports'],
            ['privacy', 'Privacy requests'],
            ['security', 'Security'],
            ['profile', 'My account'],
          ]
        : [
            ['overview', 'Overview'],
            ['bookings', 'Bookings & messages'],
            ['calendar', 'Calendar'],
            ['payments', 'Payments'],
            ...(user.role === 'client' ? [['ideas', 'Ideas']] : [['access', 'Studio permissions']]),
            ...(user.role === 'artist'
              ? [
                  ['availability', 'Availability'],
                  ['artwork', 'Artwork'],
                ]
              : []),
            ...(workspace.data?.studios.length
              ? [
                  ['studio', 'Studio'],
                  ['services', 'Services'],
                  ['team', 'Team'],
                  ['events', 'Events'],
                ]
              : []),
            ['security', 'Security'],
            ['support', 'Support'],
            ['profile', 'My account'],
          ];
  const tab = tabs.some(([key]) => key === params.get('tab')) ? params.get('tab')! : tabs[0][0];
  return (
    <section className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <PenTool size={22} />
          <span>
            {admin
              ? 'VENUE ADMIN'
              : user.role === 'studio'
                ? 'STUDIO WORKSPACE'
                : user.role === 'artist'
                  ? 'ARTIST WORKSPACE'
                  : 'YOUR VENUE'}
          </span>
        </div>
        <div className="workspace-user">
          <span className="avatar large">{user.name[0]}</span>
          <strong>{user.name}</strong>
          <small>{user.role}</small>
        </div>
        <nav aria-label="Workspace navigation">
          {tabs.map(([key, title]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => setParams({ tab: key })}
            >
              {title}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </nav>
        <Button
          variant="outline"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              await request('/auth/logout', { method: 'POST', body: '{}' });
              client.clear();
              navigate('/login');
            } catch (error) {
              toast.error((error as Error).message);
            } finally {
              setSigningOut(false);
            }
          }}
        >
          <LogOut size={16} />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </aside>
      <div className="workspace-main">
        <div className="workspace-title">
          <div>
            <span className="workspace-kicker">
              {admin ? 'VENUE ADMINISTRATION' : 'YOUR CREATIVE SPACE'}
            </span>
            <h1>
              {tab === 'overview'
                ? 'Good to see you, ' + user.name.split(' ')[0] + '.'
                : tabs.find(([key]) => key === tab)?.[1] + '.'}
            </h1>
          </div>
          <Button asChild variant="dark">
            <Link to={admin ? '/admin?tab=users' : '/booking'}>
              <CalendarDays size={17} />
              {admin ? 'Manage accounts' : 'Make a booking'}
            </Link>
          </Button>
        </div>
        {tab === 'access' ? (
          <AccessPanel />
        ) : tab === 'security' ? (
          <SecurityPanel />
        ) : tab === 'operations' ? (
          <OperationsPanel />
        ) : tab === 'reports' ? (
          <ReportsPanel />
        ) : tab === 'privacy' ? (
          <PrivacyPanel />
        ) : tab === 'overview' ? (
          admin ? (
            <AdminOverview />
          ) : (
            <Overview />
          )
        ) : tab === 'bookings' ? (
          <BookingList />
        ) : tab === 'calendar' ? (
          <BookingList calendar />
        ) : tab === 'payments' ? (
          <PaymentsPanel staff={staff} />
        ) : tab === 'ideas' ? (
          <IdeasPanel />
        ) : tab === 'support' ? (
          <>
            <SupportPanel />
            <Button asChild>
              <Link to="/contact">Send a support enquiry ↗</Link>
            </Button>
          </>
        ) : tab === 'profile' ? (
          <AccountPanel />
        ) : tab === 'availability' ? (
          <AvailabilityPanel />
        ) : tab === 'artwork' ? (
          <ArtworkPanel />
        ) : tab === 'studio' ? (
          <StudioSettings />
        ) : tab === 'services' ? (
          <ServicesPanel />
        ) : tab === 'team' ? (
          <TeamPanel />
        ) : tab === 'events' ? (
          <EventsPanel />
        ) : tab === 'artists' ? (
          <AdminArtists />
        ) : tab === 'users' ? (
          <UsersPanel />
        ) : tab === 'inbox' ? (
          <SupportPanel admin />
        ) : tab === 'journal' ? (
          <ArticlesPanel />
        ) : tab === 'settings' ? (
          <SiteSettings />
        ) : (
          <AuditPanel />
        )}
      </div>
    </section>
  );
}
