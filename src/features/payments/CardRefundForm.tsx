import { useRef } from 'react';
import type { Payment } from '../../lib/types';
import { SaveForm, str, cents } from '../workspace/Forms';
import { request } from '../../lib/api';
import { toast } from 'sonner';
export function CardRefundForm({ payment }: { payment: Payment }) {
  const key = useRef(crypto.randomUUID());
  return (
    <SaveForm
      label="Authorize card refund"
      fields={[
        {
          name: 'amount',
          label: 'Refund amount in USD',
          type: 'number',
          min: 0.01,
          step: '0.01',
          required: true,
        },
        { name: 'reason', label: 'Refund reason', type: 'textarea', required: true },
      ]}
      onSave={async (data) => {
        const result = await request<{ refund: { status: string } }>('/cards/refunds', {
          method: 'POST',
          body: JSON.stringify({
            paymentId: payment.id,
            amountCents: cents(data, 'amount'),
            reason: str(data, 'reason'),
            idempotencyKey: key.current,
          }),
        });
        toast.success('Refund ' + result.refund.status);
        if (result.refund.status === 'succeeded' || result.refund.status === 'failed')
          key.current = crypto.randomUUID();
      }}
    />
  );
}
