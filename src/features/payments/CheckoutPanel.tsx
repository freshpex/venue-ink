import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Wallet } from 'lucide-react';
import { useApi, useRefresh } from '../../lib/queries';
import { request } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
type CheckoutResult = {
  mailto: string;
  details: string;
  subject: string;
  recipient: string;
  webmail: { gmail: string; outlook: string };
  payment: {
    id: string;
    status: string;
    amount_cents: number | null;
    currency: string;
    method: string;
  };
};
export function CheckoutPanel({ bookingId }: { bookingId: string }) {
  const site = useApi<{ paymentMethods: string[] }>('/site');
  const [method, setMethod] = useState('');
  const [purpose, setPurpose] = useState<'deposit' | 'balance'>('balance');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const key = useRef(crypto.randomUUID());
  const mailFrame = useRef<HTMLIFrameElement | null>(null);
  const refresh = useRefresh();
  useEffect(
    () => () => {
      mailFrame.current?.remove();
    },
    [],
  );
  function openEmail(mailto: string) {
    mailFrame.current?.remove();
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'Payment email';
    frame.dataset.paymentEmail = 'true';
    frame.src = mailto;
    document.body.appendChild(frame);
    mailFrame.current = frame;
  }
  return (
    <section className="checkout-panel">
      <span className="workspace-kicker">
        <Wallet size={17} /> YOUR PAYMENT
      </span>
      <h3>Take the next step.</h3>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!method || busy) return;
          setBusy(true);
          setError('');
          try {
            const response = await request<CheckoutResult>('/checkout', {
              method: 'POST',
              body: JSON.stringify({ bookingId, method, purpose, idempotencyKey: key.current }),
            });
            setResult(response);
            void refresh();
            toast.info(
              'Your email app is opening. Review and send the prepared message to continue.',
            );
            openEmail(response.mailto);
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
            disabled={busy}
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
            disabled={busy}
            onChange={(event) => {
              setPurpose(event.target.value as 'deposit' | 'balance');
              setResult(null);
              key.current = crypto.randomUUID();
            }}
          >
            <option value="balance">Remaining booking balance</option>
            <option value="deposit">Booking deposit</option>
          </select>
        </label>
        {site.isError && (
          <p className="field-error" role="alert">
            {site.error.message}
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="dark" type="submit" disabled={busy || !method}>
          {busy ? 'Preparing your payment…' : 'Proceed to payment'}
          <ArrowUpRight size={18} />
        </Button>
      </form>
      {result && (
        <div className="payment-email-ready" role="status">
          <Check size={21} />
          <div>
            <h4>Continue in your email app.</h4>
            <p>
              Your selected method and booking details are filled in for {result.recipient}. Review
              and send the message to continue. No funds have been taken.
            </p>
            <p>If your email app did not open, choose an option below.</p>
            <a className="arrow-link" href={result.mailto} target="_blank" rel="noreferrer">
              Open my email
              <ArrowUpRight size={16} />
            </a>
            <div className="payment-mail-options">
              <a
                className="arrow-link"
                href={result.webmail.gmail}
                target="_blank"
                rel="noreferrer"
              >
                Use Gmail ↗
              </a>
              <a
                className="arrow-link"
                href={result.webmail.outlook}
                target="_blank"
                rel="noreferrer"
              >
                Use Outlook ↗
              </a>
            </div>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    'To: ' +
                      result.recipient +
                      '\nSubject: ' +
                      result.subject +
                      '\n\n' +
                      result.details,
                  );
                  toast.success('Payment details copied');
                } catch {
                  toast.error('Copy is unavailable. Use one of the email links instead.');
                }
              }}
            >
              <Copy size={14} /> Copy payment details
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
