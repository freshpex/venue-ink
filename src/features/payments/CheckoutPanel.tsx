import { useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Mail, Wallet } from 'lucide-react';
import { useApi, useRefresh } from '../../lib/queries';
import { request } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
type CheckoutResult = {
  mailto: string;
  details: string;
  recipient: string;
  payment: {
    id: string;
    status: string;
    amount_cents: number | null;
    currency: string;
    method: string;
  };
};
export function CheckoutPanel({ bookingId }: { bookingId: string }) {
  const site = useApi<{
    cardPaymentsEnabled: boolean;
    paymentMethods: string[];
    settings: { payment_email: string };
  }>('/site');
  const [method, setMethod] = useState('');
  const [purpose, setPurpose] = useState<'deposit' | 'balance'>('balance');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const key = useRef(crypto.randomUUID());
  const refresh = useRefresh();
  const activeCards = useApi<{
    checkouts: {
      id: string;
      state: string;
      checkout_url: string | null;
      amount_cents: number;
      purpose: string;
    }[];
  }>('/cards/checkouts/' + bookingId);
  const cardKey = useRef(crypto.randomUUID());
  return (
    <section className="checkout-panel">
      <span className="workspace-kicker">
        <Wallet size={17} /> PAYMENT ARRANGEMENTS
      </span>
      <h3>Choose your way forward.</h3>
      <p>
        Select a payment method. Your email will include the booking details and the amount to
        arrange with the team.
      </p>
      {site.data?.cardPaymentsEnabled && (
        <div className="card-checkout-actions">
          <p>
            Pay securely by card through Stripe. Your card details stay with the payment provider.
            Returning to Venue does not mark a payment received; provider confirmation updates the
            booking.
          </p>
          {activeCards.data?.checkouts.map((c) => (
            <div className="entity-row" key={c.id}>
              <span>
                <strong>
                  Card {c.purpose} · {(c.amount_cents / 100).toFixed(2)} USD
                </strong>
                <small>{c.state}</small>
              </span>
              {c.checkout_url && (
                <a className="arrow-link" href={c.checkout_url}>
                  Resume checkout ↗
                </a>
              )}
              <Button
                size="small"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await request('/cards/checkouts/' + c.id + '/cancel', {
                      method: 'POST',
                      body: '{}',
                    });
                    cardKey.current = crypto.randomUUID();
                    void refresh();
                  } catch (error) {
                    setError((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Cancel card checkout
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="dark"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const checkout = await request<{ url: string }>('/cards/checkout', {
                  method: 'POST',
                  body: JSON.stringify({ bookingId, purpose, idempotencyKey: cardKey.current }),
                });
                window.location.assign(checkout.url);
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Pay {purpose === 'deposit' ? 'deposit' : 'balance'} by card ↗
          </Button>
        </div>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!method) return;
          setBusy(true);
          setError('');
          try {
            const response = await request<CheckoutResult>('/checkout', {
              method: 'POST',
              body: JSON.stringify({ bookingId, method, purpose, idempotencyKey: key.current }),
            });
            setResult(response);
            void refresh();
            toast.success('Payment enquiry prepared. Open your email when you are ready.');
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Payment method
          <select
            aria-label="Payment method"
            value={method}
            required
            onChange={(event) => {
              setMethod(event.target.value);
              setResult(null);
              key.current = crypto.randomUUID();
            }}
          >
            <option value="">Choose your payment method</option>
            {site.data?.paymentMethods.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Payment purpose
          <select
            aria-label="Payment purpose"
            value={purpose}
            onChange={(event) => {
              setPurpose(event.target.value as 'deposit' | 'balance');
              cardKey.current = crypto.randomUUID();
              setResult(null);
              key.current = crypto.randomUUID();
            }}
          >
            <option value="balance">Booking balance / quote</option>
            <option value="deposit">Booking deposit</option>
          </select>
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="dark" type="submit" disabled={busy || !method}>
          {busy ? 'Preparing your payment enquiry…' : 'Continue by email'}
          <Mail size={18} />
        </Button>
      </form>
      {result && (
        <div className="payment-email-ready" role="status">
          <Check size={21} />
          <div>
            <h4>Your payment enquiry is ready.</h4>
            <p>Send it to {result.recipient} to arrange the next step.</p>
            <a className="arrow-link" href={result.mailto} target="_blank" rel="noreferrer">
              Open my email
              <ArrowUpRight size={16} />
            </a>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `To: ${result.recipient}\n\n${result.details}`,
                  );
                  toast.success('Payment details copied');
                } catch {
                  toast.error('Copy is unavailable. You can open the email link instead.');
                }
              }}
            >
              <Copy size={14} /> Copy payment details
            </button>
          </div>
        </div>
      )}
      <p className="fine-print">
        Your payment status updates after the studio records the funds as received.
      </p>
    </section>
  );
}
