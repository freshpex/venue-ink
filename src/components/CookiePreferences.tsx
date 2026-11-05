import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from './ui/button';

const key = 'venue-cookie-consent';
type Consent = { version: 1; chat: boolean; savedAt: number };
function readConsent(): Consent | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value?.version === 1 &&
      typeof value.chat === 'boolean' &&
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
  const [chat, setChat] = useState(consent?.chat ?? false);
  function save(allowChat: boolean) {
    const choice: Consent = { version: 1, chat: allowChat, savedAt: Date.now() };
    try {
      localStorage.setItem(key, JSON.stringify(choice));
    } catch {
      /* Sign-in remains available if preference storage is unavailable. */
    }
    setConsent(choice);
    setChat(allowChat);
    setOpen(false);
    window.dispatchEvent(new CustomEvent('venue:cookie-consent', { detail: choice }));
    if (consent?.chat && !allowChat) window.location.reload();
  }
  return (
    <>
      {!consent && (
        <section className="cookie-banner" aria-label="Cookie choices">
          <div>
            <h2>Your privacy, your choice.</h2>
            <p>
              Essential cookies keep sign-in and bookings working. Optional cookies enable live
              chat. <Link to="/privacy">Privacy notice</Link>
            </p>
          </div>
          <div className="cookie-actions">
            <Button variant="outline" onClick={() => save(false)}>
              Only essential
            </Button>
            <Button variant="dark" onClick={() => save(true)}>
              Allow all
            </Button>
            <button type="button" className="text-button" onClick={() => setOpen(true)}>
              Manage preferences
            </button>
          </div>
        </section>
      )}
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          setChat(consent?.chat ?? false);
          setOpen(value);
        }}
      >
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
              You can sign in and book with essential cookies only. Choose whether to enable
              optional live chat.
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
                <strong>Live chat</strong>
                <small>Allow Tawk.to to provide live support and remember conversations.</small>
              </span>
              <input
                type="checkbox"
                checked={chat}
                onChange={(event) => setChat(event.target.checked)}
                aria-label="Optional live chat cookies"
              />
            </label>
            <div className="cookie-actions">
              <Button variant="outline" onClick={() => save(false)}>
                Only essential
              </Button>
              <Button variant="dark" onClick={() => save(chat)}>
                Save preferences
              </Button>
              <Button variant="outline" onClick={() => save(true)}>
                Allow all
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
