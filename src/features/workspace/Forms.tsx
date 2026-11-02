import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Eye, EyeOff, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { useRefresh } from '../../lib/queries';
export type Field = {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'number'
    | 'time'
    | 'datetime-local'
    | 'password'
    | 'textarea'
    | 'select'
    | 'checkbox';
  value?: string | number | boolean;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  options?: { value: string; label: string }[];
  hint?: string;
};
function Input({ field }: { field: Field }) {
  const [visible, setVisible] = useState(false);
  const common = {
    'aria-label': field.label,
    name: field.name,
    required: field.required,
    min: field.min,
    max: field.max,
    step: field.step,
  };
  return (
    <label className={field.type === 'checkbox' ? 'check-field' : ''}>
      {field.type === 'checkbox' ? (
        <>
          <input type="checkbox" name={field.name} defaultChecked={!!field.value} />
          <span>{field.label}</span>
        </>
      ) : (
        <>
          {field.label}
          {field.type === 'textarea' ? (
            <textarea {...common} rows={5} defaultValue={String(field.value ?? '')} />
          ) : field.type === 'select' ? (
            <select {...common} defaultValue={String(field.value ?? '')}>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === 'password' ? (
            <div className="password-field">
              <input
                {...common}
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
              />
              <button
                type="button"
                aria-label={visible ? 'Hide password' : 'Show password'}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          ) : (
            <input
              {...common}
              type={field.type || 'text'}
              defaultValue={String(field.value ?? '')}
            />
          )}
        </>
      )}
      {field.hint && <small>{field.hint}</small>}
    </label>
  );
}
export function SaveForm({
  fields,
  onSave,
  label = 'Save changes',
  children,
}: {
  fields: Field[];
  onSave: (data: FormData) => Promise<unknown>;
  label?: string;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useRefresh();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await onSave(data);
      toast.success('Saved');
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="platform-form" onSubmit={submit}>
      {fields.map((field) => (
        <Input key={field.name} field={field} />
      ))}
      {children}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <Button variant="dark" type="submit" disabled={busy}>
        <Save size={17} />
        {busy ? 'Saving…' : label}
      </Button>
    </form>
  );
}
export const str = (data: FormData, key: string) => String(data.get(key) || '').trim();
export const num = (data: FormData, key: string) => Number(data.get(key) || 0);
export const cents = (data: FormData, key: string) =>
  str(data, key) === '' ? null : Math.round(num(data, key) * 100);
export const checked = (data: FormData, key: string) => data.has(key);
export const options = (items: string[]) => items.map((value) => ({ value, label: value }));
