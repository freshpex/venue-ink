import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Loading, Failure } from '../../components/AsyncState';
import { request } from '../../lib/api';
import { useApi, useRefresh, money } from '../../lib/queries';

type Preset = {
  key: string;
  name: string;
  description: string;
  category: string;
  durationMinutes: number;
  priceCents: number | null;
  depositCents: number;
  active: boolean;
};
type Menu = {
  artist: { id: string; display_name: string; studio_name: string };
  presets: Preset[];
  source: 'studio' | 'starter';
  currency: string;
  existing: { name: string; preset_key: string | null }[];
};

function PresetEditor({ menu, close }: { menu: Menu; close: () => void }) {
  const alreadyAdded = (p: Preset) =>
    menu.existing.some(
      (s) => s.preset_key === p.key || s.name.trim().toLowerCase() === p.name.trim().toLowerCase(),
    );
  const [rows, setRows] = useState(() =>
    menu.presets.map((p) => ({ ...p, selected: !alreadyAdded(p) })),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const refresh = useRefresh();
  const form = useRef<HTMLFormElement>(null);
  const selected = rows.filter((r) => r.selected);
  const endpoint = '/admin/artists/' + menu.artist.id + '/service-presets';
  const values = (row: (typeof rows)[number]): Preset => {
    return {
      key: row.key,
      name: row.name,
      description: row.description,
      category: row.category,
      durationMinutes: row.durationMinutes,
      priceCents: row.priceCents,
      depositCents: row.depositCents,
      active: row.active,
    };
  };
  function update(key: string, patch: Partial<(typeof rows)[number]>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  async function save(standard = false) {
    if (!form.current?.reportValidity()) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ created: { id: string }[]; skipped: string[] }>(endpoint, {
        method: standard ? 'PUT' : 'POST',
        body: JSON.stringify({ services: (standard ? rows : selected).map(values) }),
      });
      if (standard) toast.success('Studio standard saved');
      else {
        toast.success(
          `${result.created.length} services added${result.skipped.length ? ` · ${result.skipped.length} existing services skipped` : ''}`,
        );
        close();
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-card service-presets">
      <div className="section-heading">
        <div>
          <h2>Build {menu.artist.display_name}’s menu.</h2>
          <p>
            {menu.source === 'studio' ? 'Saved studio standard' : 'Editable starter prices'} ·{' '}
            {menu.currency} · {menu.artist.studio_name}
          </p>
        </div>
        <Button type="button" variant="ghost" disabled={busy} onClick={close}>
          Close preview
        </Button>
      </div>
      <p>
        Select the services this artist offers. Names, durations, descriptions, prices and deposits
        are filled in for you. Existing artist services are skipped.
      </p>
      <form
        ref={form}
        className="platform-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} className="preset-fieldset">
          <legend className="sr-only">Standard services for {menu.artist.display_name}</legend>
          <div className="staff-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setRows((current) => current.map((r) => ({ ...r, selected: !alreadyAdded(r) })))
              }
            >
              Select available services
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRows((current) => current.map((r) => ({ ...r, selected: false })))}
            >
              Clear selection
            </Button>
            <span role="status">
              {selected.length} {selected.length === 1 ? 'service' : 'services'} selected
            </span>
          </div>
          <div
            className="preset-list"
            role="region"
            aria-label="Standard service presets"
            tabIndex={0}
          >
            {rows.map((row) => (
              <details className="preset-row" key={row.key}>
                <summary>
                  <label className="preset-select" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={'Include ' + row.name}
                      checked={row.selected}
                      disabled={alreadyAdded(row)}
                      onChange={(event) => update(row.key, { selected: event.target.checked })}
                    />
                    <span>
                      <strong>{row.name}</strong>
                      <small>
                        {row.category} · {row.durationMinutes} min
                        {alreadyAdded(row) ? ' · Already added' : ''}
                      </small>
                    </span>
                  </label>
                  <span className="preset-price">
                    {money(row.priceCents)}
                    <small>Deposit {money(row.depositCents)}</small>
                  </span>
                  <span className="preset-edit">Edit details</span>
                </summary>
                <div className="preset-fields">
                  <label>
                    Service name
                    <input
                      aria-label={'Service name for ' + row.key}
                      value={row.name}
                      required
                      minLength={3}
                      maxLength={100}
                      onChange={(e) => update(row.key, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Category
                    <input
                      aria-label={'Category for ' + row.key}
                      value={row.category}
                      required
                      minLength={2}
                      maxLength={60}
                      onChange={(e) => update(row.key, { category: e.target.value })}
                    />
                  </label>
                  <label>
                    Duration (minutes)
                    <input
                      aria-label={'Duration for ' + row.key}
                      type="number"
                      min={15}
                      max={480}
                      step={1}
                      required
                      value={row.durationMinutes}
                      onChange={(e) => update(row.key, { durationMinutes: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Price (USD)
                    <input
                      aria-label={'Price for ' + row.key}
                      type="number"
                      min={0}
                      max={1000000}
                      step="0.01"
                      value={row.priceCents === null ? '' : row.priceCents / 100}
                      onChange={(e) =>
                        update(row.key, {
                          priceCents:
                            e.target.value === '' ? null : Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                    <small>Leave empty for an individual quote.</small>
                  </label>
                  <label>
                    Deposit (USD)
                    <input
                      aria-label={'Deposit for ' + row.key}
                      type="number"
                      min={0}
                      max={row.priceCents === null ? 1000000 : row.priceCents / 100}
                      step="0.01"
                      required
                      value={row.depositCents / 100}
                      onChange={(e) =>
                        update(row.key, { depositCents: Math.round(Number(e.target.value) * 100) })
                      }
                    />
                  </label>
                  <label className="preset-description">
                    Description
                    <textarea
                      aria-label={'Description for ' + row.key}
                      rows={3}
                      maxLength={1500}
                      value={row.description}
                      onChange={(e) => update(row.key, { description: e.target.value })}
                    />
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) => update(row.key, { active: e.target.checked })}
                    />
                    <span>Available to clients</span>
                  </label>
                </div>
              </details>
            ))}
          </div>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="staff-actions">
            <Button type="submit" disabled={!selected.length}>
              {busy ? 'Saving…' : `Add ${selected.length} selected services`}
            </Button>
            <Button type="button" variant="outline" onClick={() => void save(true)}>
              Save as studio standard
            </Button>
          </div>
          <p className="preset-note">
            Save the full menu’s names, descriptions, prices and durations as defaults for other
            artists in this studio.
          </p>
        </fieldset>
      </form>
    </section>
  );
}

export function StandardServices({
  artistId,
  artists,
}: {
  artistId?: string;
  artists: { id: string; display_name: string }[];
}) {
  const [choice, setChoice] = useState(''),
    [open, setOpen] = useState(false);
  const target = artistId || choice;
  const query = useApi<Menu>('/admin/artists/' + target + '/service-presets', {
    enabled: open && !!target,
  });
  return (
    <>
      <div className="staff-actions standard-service-launcher">
        {!artistId && (
          <label>
            Artist for standard menu
            <select
              aria-label="Artist for standard menu"
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value);
                setOpen(false);
              }}
            >
              <option value="">Choose an artist</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!target}
          onClick={() => setOpen((v) => !v)}
        >
          Auto-fill standard services
        </Button>
      </div>
      {open &&
        (query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Failure message={query.error.message} />
        ) : (
          <PresetEditor
            key={JSON.stringify(query.data)}
            menu={query.data}
            close={() => setOpen(false)}
          />
        ))}
    </>
  );
}
