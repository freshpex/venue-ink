import { useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Loading, Failure } from '../components/AsyncState';
import { useSession, useApi, useRefresh, dateTime, money, assetUrl } from '../lib/queries';
import { request } from '../lib/api';
import type { Booking, Asset, Message } from '../lib/types';
import { CheckoutPanel } from '../features/payments/CheckoutPanel';
import { SaveForm, str, cents } from '../features/workspace/Forms';
export default function BookingDetail() {
  const session = useSession();
  const { id } = useParams();
  const query = useApi<{ booking: Booking; assets: Asset[]; canManage: boolean }>(
    '/bookings/' + id,
    {
      enabled: !!session.data,
    },
  );
  const messages = useApi<{ messages: Message[] }>('/bookings/' + id + '/messages', {
    enabled: !!session.data,
    interval: 15000,
  });
  const refresh = useRefresh();
  const [sending, setSending] = useState(false);
  if (session.isPending) return <Loading />;
  if (session.isError) return <Failure message={session.error.message} />;
  if (!session.data) return <Navigate to={'/login?next=/bookings/' + id} replace />;
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} retry={() => query.refetch()} />;
  const b = query.data.booking;
  const manager = query.data.canManage;
  const closed = ['declined', 'cancelled', 'completed'].includes(b.status);
  return (
    <section className="container booking-detail-page">
      <Link className="back-link" to="/dashboard?tab=bookings">
        <ArrowLeft size={17} />
        Back to bookings
      </Link>
      <div className="workspace-title">
        <div>
          <span className="workspace-kicker">{b.reference}</span>
          <h1>{b.title}</h1>
          <p>
            {b.service_name} · {b.artist_name} · {b.studio_name}
          </p>
        </div>
        <span className={'status status-' + b.status}>{b.status}</span>
      </div>
      <div className="workspace-columns">
        <div>
          <section className="workspace-card">
            <h2>The appointment.</h2>
            <dl className="booking-facts">
              <div>
                <dt>Time</dt>
                <dd>
                  {dateTime(b.starts_at, b.timezone)} ({b.timezone})
                </dd>
              </div>
              <div>
                <dt>Client</dt>
                <dd>{b.client_name}</dd>
              </div>
              <div>
                <dt>Placement / size</dt>
                <dd>
                  {b.placement || 'To discuss'} · {b.size_note || 'To discuss'}
                </dd>
              </div>
              <div>
                <dt>Quote</dt>
                <dd>{money(b.quote_cents, b.currency)}</dd>
              </div>
              <div>
                <dt>Deposit</dt>
                <dd>{money(b.deposit_cents, b.currency)}</dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{money(b.paid_cents, b.currency)}</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>
                  {money(
                    b.quote_cents === null ? null : Math.max(0, b.quote_cents - b.paid_cents),
                    b.currency,
                  )}
                </dd>
              </div>
            </dl>
            <p className="pre-wrap">{b.notes}</p>
            <div className="asset-grid">
              {query.data.assets.map((asset) => (
                <a key={asset.id} href={assetUrl(asset.url)} target="_blank" rel="noreferrer">
                  <img src={assetUrl(asset.url)} alt={asset.filename} />
                </a>
              ))}
            </div>
            {b.cancellation_note && <p>{b.cancellation_note}</p>}
          </section>
          {!closed && manager && (
            <section className="workspace-card">
              <h2>Review the request.</h2>
              <SaveForm
                key={b.updated_at}
                fields={[
                  {
                    name: 'status',
                    label: 'Booking status',
                    type: 'select',
                    value: b.status,
                    options: [
                      ...(b.status === 'pending'
                        ? [{ value: 'pending', label: 'Pending review' }]
                        : []),
                      { value: 'confirmed', label: 'Confirm appointment' },
                      { value: 'declined', label: 'Decline request' },
                      { value: 'cancelled', label: 'Cancel booking' },
                      ...(b.status === 'confirmed'
                        ? [{ value: 'completed', label: 'Mark completed' }]
                        : []),
                    ],
                  },
                  {
                    name: 'quote',
                    label: 'Agreed quote in USD (empty if not yet quoted)',
                    type: 'number',
                    value: b.quote_cents === null ? '' : b.quote_cents / 100,
                    min: 0,
                    step: '0.01',
                  },
                  {
                    name: 'deposit',
                    label: 'Deposit in USD',
                    type: 'number',
                    value: b.deposit_cents / 100,
                    min: 0,
                    step: '0.01',
                  },
                  {
                    name: 'start',
                    label: 'Reschedule (optional, your browser time zone)',
                    type: 'datetime-local',
                  },
                  {
                    name: 'note',
                    label: 'Update note',
                    type: 'textarea',
                    value: b.cancellation_note,
                  },
                ]}
                onSave={(data) =>
                  request('/bookings/' + b.id, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      ...(str(data, 'status') === 'pending' ? {} : { status: str(data, 'status') }),
                      quoteCents: cents(data, 'quote'),
                      depositCents: cents(data, 'deposit') || 0,
                      ...(str(data, 'start')
                        ? { startsAt: new Date(str(data, 'start')).toISOString() }
                        : {}),
                      note: str(data, 'note'),
                    }),
                  })
                }
              />
            </section>
          )}
          {!closed && !manager && (
            <section className="workspace-card">
              <h2>Need to change direction?</h2>
              <p>Message your artist about a new time or cancel your request below.</p>
              <SaveForm
                fields={[
                  { name: 'reason', label: 'Cancellation note', type: 'textarea', required: true },
                ]}
                label="Cancel my booking"
                onSave={(data) =>
                  request('/bookings/' + b.id, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'cancelled', note: str(data, 'reason') }),
                  })
                }
              />
            </section>
          )}
          {b.client_id === session.data.id &&
            !['cancelled', 'declined'].includes(b.status) &&
            (b.quote_cents === null || b.paid_cents < b.quote_cents) && (
              <CheckoutPanel bookingId={b.id} />
            )}
        </div>
        <section className="workspace-card conversation-card">
          <span className="workspace-kicker">
            <MessageSquare size={16} /> YOUR BOOKING CONVERSATION
          </span>
          <h2>Keep the details together.</h2>
          <div className="message-thread" aria-live="polite">
            {messages.isError ? (
              <Failure message={messages.error.message} />
            ) : messages.data?.messages.length ? (
              messages.data.messages.map((message) => (
                <div
                  className={
                    'message-bubble ' + (message.sender_id === session.data?.id ? 'mine' : '')
                  }
                  key={message.id}
                >
                  <strong>{message.sender_name}</strong>
                  <p>{message.body}</p>
                  <time>{dateTime(message.created_at)}</time>
                </div>
              ))
            ) : (
              <p>Ask a question or share a detail with your artist.</p>
            )}
          </div>
          <form
            className="platform-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const body = String(new FormData(form).get('body') || '').trim();
              if (!body) return;
              setSending(true);
              try {
                await request('/bookings/' + b.id + '/messages', {
                  method: 'POST',
                  body: JSON.stringify({ body }),
                });
                form.reset();
                refresh();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setSending(false);
              }
            }}
          >
            <label>
              Your message
              <textarea name="body" required maxLength={3000} rows={3} />
            </label>
            <Button variant="dark" disabled={sending}>
              {sending ? 'Sending…' : 'Send message'}
              <Send size={17} />
            </Button>
          </form>
        </section>
      </div>
    </section>
  );
}
