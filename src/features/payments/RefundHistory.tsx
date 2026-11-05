import { useState } from 'react';
import { request } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { useApi, useSession, dateTime, money } from '../../lib/queries';
import { Failure } from '../../components/AsyncState';
export function RefundHistory({ bookingId }: { bookingId: string }) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const query = useApi<{
    refunds: {
      id: string;
      amount_cents: number;
      status: string;
      reason: string;
      created_at: string;
      provider_id: string | null;
    }[];
  }>('/cards/refunds/' + bookingId, { interval: 30000 });
  if (query.isError) return <Failure message={query.error.message} />;
  if (!query.data?.refunds.length) return null;
  return (
    <section className="workspace-card">
      <h2>Refund history</h2>
      {query.data.refunds.map((r) => (
        <div className="entity-row" key={r.id}>
          <span>
            <strong>
              {money(r.amount_cents)} · {r.status}
            </strong>
            <small>
              {r.reason} · {dateTime(r.created_at)}
            </small>
          </span>
          {session.data?.role === 'admin' && !r.provider_id && r.status === 'pending' && (
            <Button
              size="small"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await request('/cards/refunds/' + r.id + '/retry', {
                    method: 'POST',
                    body: '{}',
                  });
                  void query.refetch();
                } catch (error) {
                  toast.error((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Retry refund confirmation
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
