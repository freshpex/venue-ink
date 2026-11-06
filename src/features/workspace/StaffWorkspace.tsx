import { Link } from 'react-router-dom';
import { useApi, useSession, dateTime } from '../../lib/queries';
import { Loading, Failure, Empty } from '../../components/AsyncState';
import { ProfileAvatar } from '../../components/ProfilePhoto';
import { Button } from '../../components/ui/button';
import type { ProfileData } from './AccountPanel';

export function StaffWorkspaceOverview() {
  const user = useSession().data;
  const profile = useApi<ProfileData>('/profile');
  const stats = useApi<{ stats: Record<string, number> }>('/dashboard');
  const service = useApi<{ services: { id: string }[] }>('/workspace/services');
  if (profile.isPending || stats.isPending || service.isPending) return <Loading />;
  if (profile.isError || stats.isError || service.isError)
    return (
      <Failure
        message={
          (profile.error || stats.error || service.error)?.message ||
          'Your workspace could not be loaded.'
        }
      />
    );
  const artist = profile.data.profile;
  const studio = profile.data.serviceStudios?.find((s) => s.id === artist?.studio_id);
  const steps =
    user?.role === 'artist'
      ? [
          {
            label: 'Artist page',
            ready: !!artist?.published,
            description: 'Your introduction, styles and profile photograph.',
            tab: 'profile',
          },
          {
            label: 'Services',
            ready: service.data.services.length > 0,
            description: 'Create the services clients can book with you.',
            tab: 'services',
          },
          {
            label: 'Working hours',
            ready: profile.data.availability.length > 0,
            description: 'Set the days and times clients can request.',
            tab: 'availability',
          },
          {
            label: 'Open your books',
            ready: !!artist?.books_open && !!studio?.published,
            description: studio?.published
              ? 'Choose when to accept new booking requests.'
              : 'Your studio must be published before clients can book.',
            tab: profile.data.studios.length ? 'studio' : 'profile',
          },
        ]
      : [
          {
            label: 'Studio details',
            ready: profile.data.studios.some((s) => s.published),
            description: 'Photographs, address, time zone and your public studio page.',
            tab: 'studio',
          },
          {
            label: 'Service menu',
            ready: service.data.services.length > 0,
            description: 'Shared studio services and artist-specific appointments.',
            tab: 'services',
          },
          {
            label: 'Artist team',
            ready: (profile.data.serviceArtists?.length || 0) > 0,
            description: 'Manage your artists and invite your team.',
            tab: 'team',
          },
        ];
  return (
    <>
      <section className="workspace-card staff-welcome">
        <span className="workspace-kicker">
          {user?.role === 'artist' ? 'YOUR ARTIST BUSINESS' : 'STUDIO OPERATIONS'}
        </span>
        <h2>
          {user?.role === 'artist'
            ? 'Your work. Your clients. Your books.'
            : 'Your studio, working together.'}
        </h2>
        <p>
          Manage the services, appointments and client conversations that keep your work moving.
        </p>
        <div className="staff-actions">
          <Button asChild>
            <Link to="/dashboard?tab=services">Add a service</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard?tab=bookings">Manage appointments</Link>
          </Button>
          {artist?.published && studio?.published && (
            <Button asChild variant="outline">
              <Link to={'/artists/' + artist.slug}>View artist page</Link>
            </Button>
          )}
        </div>
      </section>
      <div className="workspace-stats">
        {[
          ['Pending requests', stats.data.stats.pending],
          ['Confirmed appointments', stats.data.stats.confirmed],
          ['Completed appointments', stats.data.stats.completed],
          ['Your services', service.data.services.length],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className="workspace-card">
        <h2>{user?.role === 'artist' ? 'Make your artist page bookable.' : 'Studio checklist.'}</h2>
        <div className="workspace-setup-grid">
          {steps.map((step) => (
            <Link
              key={step.label}
              to={'/dashboard?tab=' + step.tab}
              className="workspace-setup-card"
            >
              <span className={step.ready ? 'setup-status ready' : 'setup-status'}>
                {step.ready ? 'Ready' : 'Needs attention'}
              </span>
              <h3>{step.label}</h3>
              <p>{step.description}</p>
              <span>Manage ↗</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="workspace-card">
        <h2>Work with your clients.</h2>
        <div className="staff-actions">
          {[
            ['clients', 'Client directory'],
            ['calendar', 'Appointment calendar'],
            ['payments', 'Payments'],
            ['bookings', 'Booking conversations'],
          ].map(([tab, label]) => (
            <Link className="arrow-link" key={tab} to={'/dashboard?tab=' + tab}>
              {label} ↗
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
export function ClientsPanel() {
  const query = useApi<{
    clients: {
      id: string;
      name: string;
      email: string;
      image_url: string | null;
      bookings: number;
      last_appointment: string;
    }[];
  }>('/workspace/clients');
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  return (
    <section className="workspace-card">
      <h2>Your clients.</h2>
      <p>
        The people who have booked with you or your studio. Open their appointments to review the
        brief, quote and conversation.
      </p>
      {query.data.clients.length ? (
        query.data.clients.map((person) => (
          <div className="entity-row" key={person.id}>
            <ProfileAvatar name={person.name} image={person.image_url} />
            <div>
              <strong>{person.name}</strong>
              <small>
                {person.email} · {person.bookings} appointments
              </small>
              <small>Latest appointment: {dateTime(person.last_appointment)}</small>
            </div>
            <Link className="arrow-link" to={'/dashboard?tab=bookings&client=' + person.id}>
              Appointments ↗
            </Link>
          </div>
        ))
      ) : (
        <Empty
          title="Your next connection starts here."
          text="Clients appear here after making a booking."
        />
      )}
    </section>
  );
}
