import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarDays,
  Inbox,
  MessageSquare,
  Palette,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';
import { useApi, useSession, dateTime, assetUrl } from '../../lib/queries';
import type { Artist, Service, Booking, FlashDesign } from '../../lib/types';
import { Loading, Failure, Empty } from '../../components/AsyncState';
import { BookingWizard } from '../booking/BookingFlow';
const tabs = [
  { name: 'Calendar', icon: CalendarDays },
  { name: 'Bookings', icon: Inbox },
  { name: 'Messages', icon: MessageSquare },
  { name: 'Artwork', icon: Palette },
];
export function StudioPanel() {
  const session = useSession();
  const [tab, setTab] = useState('Calendar');
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [day, setDay] = useState(new Date().getDate());
  const [artistId, setArtistId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [booking, setBooking] = useState(false);
  const [slot, setSlot] = useState('');
  const artistsQuery = useApi<{ artists: Artist[] }>('/artists');
  const servicesQuery = useApi<{ services: Service[] }>('/services');
  const bookingsQuery = useApi<{ bookings: Booking[] }>('/bookings', { enabled: !!session.data });
  const flashQuery = useApi<{ designs: FlashDesign[] }>('/flash', { enabled: tab === 'Artwork' });
  const artists = artistsQuery.data?.artists || [];
  const artist = artists.find((item) => item.id === artistId) || artists[0];
  const services = (servicesQuery.data?.services || []).filter(
    (item) => item.studio_id === artist?.studio_id,
  );
  const service = services.find((item) => item.id === serviceId) || services[0];
  const date = new Date(month.getFullYear(), month.getMonth(), day).toLocaleDateString('en-CA');
  const slots = useApi<{ slots: { startsAt: string; label: string }[]; timezone: string }>(
    `/availability?artistId=${artist?.id || ''}&serviceId=${service?.id || ''}&date=${date}`,
    { enabled: tab === 'Calendar' && !!artist && !!service },
  );
  const bookings = bookingsQuery.data?.bookings || [];
  return (
    <div className="studio-demo live-studio-panel">
      <div className="demo-toolbar">
        <span className="workspace-name">
          <span className="workspace-icon">V</span> Your studio
          <ChevronRight size={14} />
        </span>
        <Link className="workspace-live" to={session.data ? '/dashboard' : '/register'}>
          <span />
          {session.data ? 'My workspace' : 'Make it your Venue'}
          <ArrowUpRight size={12} />
        </Link>
      </div>
      <div className="demo-shell">
        <aside className="demo-sidebar">
          <span className="sidebar-caption">EVERYTHING, TOGETHER</span>
          {tabs.map((item) => (
            <button
              className={tab === item.name ? 'selected' : ''}
              onClick={() => setTab(item.name)}
              key={item.name}
            >
              <item.icon size={17} />
              <span>{item.name}</span>
              {item.name === 'Bookings' && session.data && <b>{bookings.length}</b>}
            </button>
          ))}
          <div className="sidebar-bottom">
            <span className="avatar">{session.data?.name[0] || 'V'}</span>
            <span>
              {session.data?.name || 'Your next chapter'}
              <small>
                {session.data ? 'Connected to your account' : 'Starts with a conversation'}
              </small>
            </span>
          </div>
        </aside>
        <div className="demo-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            >
              <div className="demo-heading">
                <div>
                  <small>SPACE FOR THE GOOD STUFF</small>
                  <h3>
                    {tab === 'Calendar'
                      ? 'Find a little space.'
                      : tab === 'Bookings'
                        ? 'The work ahead.'
                        : tab === 'Messages'
                          ? 'Keep the conversation going.'
                          : 'Ideas ready for their next chapter.'}
                  </h3>
                </div>
              </div>
              {tab === 'Calendar' ? (
                <>
                  {artistsQuery.isPending || servicesQuery.isPending ? (
                    <Loading />
                  ) : artistsQuery.isError ? (
                    <Failure
                      message={artistsQuery.error.message}
                      retry={() => artistsQuery.refetch()}
                    />
                  ) : (
                    <>
                      <div className="public-calendar-selectors">
                        <label>
                          <span className="sr-only">Artist</span>
                          <select
                            aria-label="Choose calendar artist"
                            value={artist?.id || ''}
                            onChange={(event) => {
                              setArtistId(event.target.value);
                              setServiceId('');
                            }}
                          >
                            {artists.map((item) => (
                              <option value={item.id} key={item.id}>
                                {item.display_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className="sr-only">Service</span>
                          <select
                            aria-label="Choose calendar service"
                            value={service?.id || ''}
                            onChange={(event) => setServiceId(event.target.value)}
                          >
                            {services.map((item) => (
                              <option value={item.id} key={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="calendar-toolbar">
                        <strong>
                          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </strong>
                        <div>
                          <button
                            aria-label="Previous month"
                            onClick={() => {
                              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
                              setDay(1);
                            }}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            aria-label="Next month"
                            onClick={() => {
                              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
                              setDay(1);
                            }}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="calendar-grid">
                        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((label) => (
                          <span className="calendar-weekday" key={label}>
                            {label}
                          </span>
                        ))}
                        {Array.from({ length: (month.getDay() + 6) % 7 }, (_, index) => (
                          <span key={`blank-${index}`} className="calendar-cell blank" />
                        ))}
                        {Array.from(
                          {
                            length: new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              0,
                            ).getDate(),
                          },
                          (_, index) => {
                            const current = index + 1;
                            const events = bookings.filter(
                              (item) =>
                                new Date(item.starts_at).toDateString() ===
                                new Date(
                                  month.getFullYear(),
                                  month.getMonth(),
                                  current,
                                ).toDateString(),
                            );
                            return (
                              <motion.button
                                key={current}
                                className={`calendar-cell ${day === current ? 'chosen' : ''}`}
                                whileTap={{ scale: 0.86 }}
                                onClick={() => setDay(current)}
                                aria-label={`Choose ${month.toLocaleDateString('en-US', { month: 'long' })} ${current}`}
                                aria-pressed={day === current}
                              >
                                <span>{current}</span>
                                {events.slice(0, 2).map((item) => (
                                  <small className="event-lime" key={item.id}>
                                    {item.title}
                                  </small>
                                ))}
                              </motion.button>
                            );
                          },
                        )}
                      </div>
                      <div className="calendar-slot-footer">
                        <span>Available times · {slots.data?.timezone || artist?.timezone}</span>
                        {slots.isPending ? (
                          <small>Finding appointments…</small>
                        ) : slots.isError ? (
                          <button className="text-button" onClick={() => slots.refetch()}>
                            Reconnect to the calendar
                          </button>
                        ) : slots.data?.slots.length ? (
                          <div>
                            {slots.data.slots.slice(0, 5).map((item) => (
                              <button
                                key={item.startsAt}
                                onClick={() => {
                                  setSlot(item.startsAt);
                                  setBooking(true);
                                }}
                              >
                                {item.label}
                                <ArrowUpRight size={11} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p>No open appointments on this date. Try another day.</p>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : tab === 'Artwork' ? (
                flashQuery.isPending ? (
                  <Loading />
                ) : flashQuery.data?.designs.length ? (
                  <div className="workspace-flash-grid">
                    {flashQuery.data.designs.slice(0, 3).map((item) => (
                      <Link key={item.id} to="/flash">
                        <img src={assetUrl(item.image_url)} alt={item.title} />
                        <strong>{item.title}</strong>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="Make room for a new idea."
                    text="Start a custom request and talk through the work with your artist."
                    to="/booking"
                    action="Request custom work"
                  />
                )
              ) : !session.data ? (
                <Empty
                  title={
                    tab === 'Messages'
                      ? 'Your conversations belong here.'
                      : 'Keep your next chapter close.'
                  }
                  text="Sign in to find your appointments, requests and artist conversations."
                  to="/login"
                  action="Sign in"
                />
              ) : bookingsQuery.isPending ? (
                <Loading />
              ) : bookingsQuery.isError ? (
                <Failure
                  message={bookingsQuery.error.message}
                  retry={() => bookingsQuery.refetch()}
                />
              ) : bookings.length ? (
                <div className="request-list">
                  {bookings.slice(0, 4).map((item) => (
                    <Link className="request-row" key={item.id} to={`/bookings/${item.id}`}>
                      <span className="avatar">{item.artist_name[0]}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {item.artist_name} · {dateTime(item.starts_at)}
                        </small>
                      </div>
                      <span className={`status ${item.status === 'confirmed' ? 'approved' : ''}`}>
                        {item.status}
                      </span>
                      <ArrowUpRight size={15} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="A fresh page."
                  text="Your bookings and conversations will appear here."
                  to="/booking"
                  action="Find an appointment"
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <BookingWizard
        open={booking}
        onOpenChange={setBooking}
        artistId={artist?.id}
        serviceId={service?.id}
        initialDate={date}
        initialTime={slot}
      />
    </div>
  );
}
