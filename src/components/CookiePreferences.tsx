import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from './ui/button';

const key = 'venue-cookie-consent';
type Consent = { version: 2; chat: true; savedAt: number };
function readConsent(): Consent | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value?.version === 2 &&
      value.chat === true &&
      typeof value.savedAt === 'number' &&
      value.savedAt <= Date.now() &&
      value.savedAt > Date.now() - 180 * 86400000
      ? value
      : null;
  } catch {
    return null;
  }
}

export function CookiePreferences() {
  const [consent, setConsent] = useState(readConsent);
  const [open, setOpen] = useState(false);
  function save() {
    const choice: Consent = { version: 2, chat: true, savedAt: Date.now() };
    try {
      localStorage.setItem(key, JSON.stringify(choice));
    } catch {
      /* Sign-in remains available if preference storage is unavailable. */
    }
    setConsent(choice);
    setOpen(false);
  }
  return (
    <>
      {!consent && (
        <section className="cookie-banner" aria-label="Cookie choices">
          <div>
            <h2>Cookies for your Venue.</h2>
            <p>
              Essential cookies support sign-in, bookings and live chat.{' '}
              <Link to="/privacy">Privacy notice</Link>
            </p>
          </div>
          <div className="cookie-actions">
            <Button variant="outline" onClick={save}>
              Accept essential cookies
            </Button>
            <button type="button" className="text-button" onClick={() => setOpen(true)}>
              Cookie details
            </button>
          </div>
        </section>
      )}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button type="button" className="cookie-settings-link">
            Cookie settings
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="cookie-overlay" />
          <Dialog.Content className="cookie-dialog">
            <Dialog.Title>Cookie preferences</Dialog.Title>
            <Dialog.Description>
              These services keep your account, bookings and live support working and are always
              enabled.
            </Dialog.Description>
            <label className="cookie-choice">
              <span>
                <strong>Essential cookies</strong>
                <small>Account security, sign-in and your privacy choice. Always on.</small>
              </span>
              <input type="checkbox" checked disabled aria-label="Essential cookies, always on" />
            </label>
            <label className="cookie-choice">
              <span>
                <strong>Essential live chat</strong>
                <small>Tawk.to provides live support and remembers conversations. Always on.</small>
              </span>
              <input
                type="checkbox"
                checked
                disabled
                aria-label="Essential live chat cookies, always on"
              />
            </label>
            <div className="cookie-actions">
              <Button variant="dark" onClick={save}>
                Done
              </Button>
            </div>
            <Dialog.Close className="cookie-close" aria-label="Close cookie preferences">
              <X size={22} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
