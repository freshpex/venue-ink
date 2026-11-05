import { useState } from 'react';
import { useApi, money, dateTime } from '../../lib/queries';
import { request, download } from '../../lib/api';
import { Loading, Failure } from '../../components/AsyncState';
import { Button } from '../../components/ui/button';
import { SaveForm, str } from './Forms';
import { toast } from 'sonner';

export type PageData = { page: number; limit: number; total: number; pages: number };
export function Pagination({
  data,
  onPage,
}: {
  data: PageData | undefined;
  onPage: (page: number) => void;
}) {
  if (!data) return null;
  return (
    <nav className="pagination-controls" aria-label="Result pages">
      <Button
        size="small"
        variant="outline"
        disabled={data.page <= 1}
        onClick={() => onPage(data.page - 1)}
      >
        Previous page
      </Button>
      <span role="status">
        Page {data.page} of {Math.max(1, data.pages)} · {data.total} records
      </span>
      <Button
        size="small"
        variant="outline"
        disabled={data.page >= data.pages}
        onClick={() => onPage(data.page + 1)}
      >
        Next page
      </Button>
    </nav>
  );
}
type Operations = {
  mailConfigured: boolean;
  requireStaffMfa: boolean;
  staff: { total: number; protected: number };
  queue: { state: string; count: number }[];
  workerLastRun: string | null;
  workerHealthy: boolean;
  checks: { label: string; ready: boolean; detail: string }[];
};
export function OperationsPanel() {
  const query = useApi<Operations>('/admin/operations', { interval: 30000 });
  const [page, setPage] = useState(1);
  const deliveries = useApi<{
    deliveries: {
      id: string;
      subject: string;
      state: string;
      attempts: number;
      last_error: string | null;
      recipient_name: string;
      created_at: string;
    }[];
    pagination: PageData;
  }>('/admin/deliveries?page=' + page);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  const o = query.data;
  return (
    <>
      <div className="workspace-stats">
        <div>
          <strong>
            {o.staff.protected}/{o.staff.total}
          </strong>
          <span>Staff with MFA</span>
        </div>
        {['pending', 'sent', 'failed'].map((state) => (
          <div key={state}>
            <strong>{o.queue.find((q) => q.state === state)?.count || 0}</strong>
            <span>Email {state}</span>
          </div>
        ))}
      </div>
      <section className="workspace-card">
        <h2>Operational readiness</h2>
        <p>
          Worker: {o.workerHealthy ? 'Running' : 'Not reporting recently'} ·{' '}
          {o.workerLastRun ? dateTime(o.workerLastRun) : 'No heartbeat recorded'}
        </p>
        {o.checks.map((check) => (
          <div className="entity-row" key={check.label}>
            <span>
              <strong>
                {check.label} · {check.ready ? 'Configured' : 'Action required'}
              </strong>
              <small>{check.detail}</small>
            </span>
          </div>
        ))}
      </section>
      <section className="workspace-card">
        <h2>Email delivery queue</h2>
        {!o.mailConfigured && (
          <p role="status">Email delivery is not configured. Pending messages remain queued.</p>
        )}
        {deliveries.isPending ? (
          <Loading />
        ) : deliveries.isError ? (
          <Failure message={deliveries.error.message} />
        ) : deliveries.data.deliveries.length ? (
          deliveries.data.deliveries.map((d) => (
            <div className="entity-row" key={d.id}>
              <span>
                <strong>{d.subject}</strong>
                <small>
                  {d.recipient_name} · {d.state} · {d.attempts} attempts
                </small>
                <small>
                  {dateTime(d.created_at)} {d.last_error && '· ' + d.last_error}
                </small>
              </span>
            </div>
          ))
        ) : (
          <p>No messages in the queue.</p>
        )}
        <Pagination data={deliveries.data?.pagination} onPage={setPage} />
      </section>
    </>
  );
}
export function ReportsPanel() {
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [exportPage, setExportPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const query = useApi<{
    from: string;
    to: string;
    statuses: { status: string; count: number }[];
    payments: { currency: string; received_cents: number; count: number }[];
    accounts: { role: string; count: number }[];
    refunds: { currency: string; refunded_cents: number; count: number }[];
  }>('/admin/reports?' + new URLSearchParams({ from, to }));
  return (
    <section className="workspace-card">
      <h2>Platform reporting</h2>
      <p>
        Bookings created and verified funds received in the selected UTC date range. The end date is
        exclusive.
      </p>
      <div className="workspace-filters">
        <label>
          From
          <input
            aria-label="Report start date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Until
          <input
            aria-label="Report end date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : (
        <>
          <h3>Booking statuses</h3>
          {query.data.statuses.length ? (
            query.data.statuses.map((s) => (
              <div className="entity-row" key={s.status}>
                <strong>{s.status}</strong>
                <span>{s.count}</span>
              </div>
            ))
          ) : (
            <p>No bookings in this range.</p>
          )}
          <h3>Verified receipts</h3>
          {query.data.payments.length ? (
            query.data.payments.map((p) => (
              <div className="entity-row" key={p.currency}>
                <strong>{money(Number(p.received_cents), p.currency)}</strong>
                <span>{p.count} receipts</span>
              </div>
            ))
          ) : (
            <p>No verified receipts in this range.</p>
          )}
          <h3>Completed refunds</h3>
          {query.data.refunds.length ? (
            query.data.refunds.map((r) => (
              <div className="entity-row" key={r.currency}>
                <strong>{money(Number(r.refunded_cents), r.currency)}</strong>
                <span>{r.count} refunds</span>
              </div>
            ))
          ) : (
            <p>No completed refunds in this range.</p>
          )}
          <h3>All accounts by role</h3>
          {query.data.accounts.map((a) => (
            <div className="entity-row" key={a.role}>
              <strong>{a.role}</strong>
              <span>{a.count}</span>
            </div>
          ))}
        </>
      )}
      <h3>Booking register export</h3>
      <p>
        Download all-time booking records, 200 per page, newest first. Financial amounts are in
        cents. Exports are recorded in the activity log.
      </p>
      <label>
        Export page
        <input
          type="number"
          aria-label="Export page"
          min={1}
          max={1000000}
          value={exportPage}
          onChange={(e) => setExportPage(Number(e.target.value))}
        />
      </label>
      <Button
        variant="outline"
        disabled={busy || !Number.isInteger(exportPage) || exportPage < 1}
        onClick={async () => {
          setBusy(true);
          try {
            await download(
              '/admin/reports/bookings.csv?page=' + exportPage,
              'venue-bookings-page-' + exportPage + '.csv',
            );
          } catch (error) {
            toast.error((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Download booking CSV page
      </Button>
    </section>
  );
}
export function PrivacyPanel() {
  const [page, setPage] = useState(1);
  const query = useApi<{
    requests: {
      id: string;
      name: string;
      email: string;
      kind: string;
      reason: string;
      status: string;
      resolution: string;
      created_at: string;
    }[];
    pagination: PageData;
  }>('/admin/privacy-requests?page=' + page);
  return (
    <section className="workspace-card">
      <h2>Privacy requests</h2>
      <p>
        Review correction and erasure requests. Record what was changed or why records must be
        retained; resolving a request records the outcome and does not automatically delete data.
      </p>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : query.data.requests.length ? (
        query.data.requests.map((r) => (
          <details key={r.id} className="entity-details">
            <summary>
              <strong>
                {r.name} · {r.kind}
              </strong>
              <span>
                {r.status.replace('_', ' ')} · {dateTime(r.created_at)}
              </span>
            </summary>
            <p>{r.email}</p>
            <p className="pre-wrap">{r.reason}</p>
            <SaveForm
              key={JSON.stringify(r)}
              fields={[
                {
                  name: 'status',
                  label: 'Request status',
                  type: 'select',
                  value: r.status,
                  options: ['open', 'in_progress', 'resolved'].map((value) => ({
                    value,
                    label: value.replace('_', ' '),
                  })),
                },
                {
                  name: 'resolution',
                  label: 'Action taken or retention explanation',
                  type: 'textarea',
                  value: r.resolution,
                },
              ]}
              onSave={(data) =>
                request('/admin/privacy-requests/' + r.id, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    status: str(data, 'status'),
                    resolution: str(data, 'resolution'),
                  }),
                })
              }
            />
          </details>
        ))
      ) : (
        <p>No privacy requests.</p>
      )}
      <Pagination data={query.data?.pagination} onPage={setPage} />
    </section>
  );
}

export function AccessPanel() {
  const query = useApi<{
    studios: { id: string; name: string }[];
    grants: {
      studio_id: string;
      user_id: string;
      access_role: string;
      name: string;
      email: string;
      studio_name: string;
    }[];
  }>('/team/access');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  return (
    <section className="workspace-card">
      <h2>Studio access permissions</h2>
      <p>
        Managers maintain studio settings, services and team operations. Receptionists manage
        bookings and conversations. Finance staff verify payments. Only owners and administrators
        delegate access.
      </p>
      {query.data.grants.map((g) => (
        <div className="entity-row" key={g.studio_id + g.user_id}>
          <span>
            <strong>
              {g.name} · {g.access_role}
            </strong>
            <small>
              {g.email} · {g.studio_name}
            </small>
          </span>
          <Button
            variant="outline"
            size="small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request('/team/access/' + g.studio_id + '/' + g.user_id, {
                  method: 'DELETE',
                });
                void query.refetch();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Revoke access
          </Button>
        </div>
      ))}
      {query.data.studios.length > 0 ? (
        <SaveForm
          key={version}
          label="Grant studio access"
          fields={[
            {
              name: 'studioId',
              label: 'Studio',
              type: 'select',
              required: true,
              options: query.data.studios.map((s) => ({ value: s.id, label: s.name })),
            },
            { name: 'email', label: 'Existing staff email', type: 'email', required: true },
            {
              name: 'accessRole',
              label: 'Studio access role',
              type: 'select',
              options: ['manager', 'receptionist', 'finance'].map((value) => ({
                value,
                label: value,
              })),
            },
          ]}
          onSave={async (data) => {
            await request('/team/access', {
              method: 'PUT',
              body: JSON.stringify({
                studioId: str(data, 'studioId'),
                email: str(data, 'email'),
                accessRole: str(data, 'accessRole'),
              }),
            });
            setVersion((v) => v + 1);
          }}
        />
      ) : (
        <p>Your studio owner manages access permissions.</p>
      )}
    </section>
  );
}
