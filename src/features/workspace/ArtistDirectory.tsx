import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useRefresh } from '../../lib/queries';
import { request } from '../../lib/api';
import type { Artist } from '../../lib/types';
import { Button } from '../../components/ui/button';
import { ProfileAvatar, ProfilePhotoEditor } from '../../components/ProfilePhoto';
import { Loading, Failure, Empty } from '../../components/AsyncState';
import { SaveForm, str, checked, options } from './Forms';
import { ServicesPanel } from './Management';
import { AvailabilityPanel } from './AccountPanel';
import type { ProfileData } from './AccountPanel';
type ManagedArtist = Artist & {
  email: string;
  role: string;
  active: boolean;
  service_count: number;
  availability_days: number;
  studio_published: boolean;
};
function ArtistCard({
  artist: a,
  studios,
}: {
  artist: ManagedArtist;
  studios: ProfileData['studios'];
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState('profile');
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const refresh = useRefresh();
  return (
    <details
      className="entity-details artist-management-card"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <ProfileAvatar name={a.display_name} image={a.image_url} />
        <strong>{a.display_name}</strong>
        <span>
          {a.studio_name} · {a.published ? 'Published' : 'Hidden'} ·{' '}
          {a.books_open ? 'Books open' : 'Books closed'}
        </span>
      </summary>
      {open && (
        <>
          <p>
            {a.email} · {a.active ? a.role : 'Restricted account'}
          </p>
          <div className="artist-readiness">
            <span>{a.service_count} active services</span>
            <span>{a.availability_days} working days</span>
            <span>{a.studio_published ? 'Studio published' : 'Studio hidden'}</span>
            {a.published && a.studio_published ? (
              <Link to={'/artists/' + a.slug}>View public page ↗</Link>
            ) : (
              <span>Public page hidden</span>
            )}
          </div>
          <div className="staff-actions" aria-label={'Manage ' + a.display_name}>
            {[
              ['profile', 'Edit profile'],
              ['services', 'Services'],
              ['hours', 'Working hours'],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={tab === value ? 'dark' : 'outline'}
                onClick={() => setTab(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {tab === 'services' ? (
            <ServicesPanel artistId={a.id} />
          ) : tab === 'hours' ? (
            <AvailabilityPanel artistId={a.id} />
          ) : (
            <>
              <ProfilePhotoEditor
                name={a.display_name}
                image={a.image_url}
                endpoint={'/accounts/' + a.id + '/photo'}
              />
              <SaveForm
                key={JSON.stringify(a)}
                fields={[
                  {
                    name: 'displayName',
                    label: 'Public artist name',
                    value: a.display_name,
                    required: true,
                  },
                  { name: 'bio', label: 'Artist biography', type: 'textarea', value: a.bio },
                  {
                    name: 'styles',
                    label: 'Artist styles (comma separated)',
                    value: a.styles.join(', '),
                  },
                  {
                    name: 'theme',
                    label: 'Artist page theme',
                    type: 'select',
                    value: a.theme,
                    options: options(['paper', 'ink', 'lavender']),
                  },
                  {
                    name: 'studioId',
                    label: 'Artist studio',
                    type: 'select',
                    value: a.studio_id,
                    options: studios.map((s) => ({ value: s.id, label: s.name })),
                    required: true,
                  },
                  {
                    name: 'published',
                    label: 'Publish artist profile',
                    type: 'checkbox',
                    value: a.published,
                  },
                  {
                    name: 'booksOpen',
                    label: 'Accept booking requests',
                    type: 'checkbox',
                    value: a.books_open,
                  },
                ]}
                onSave={(data) =>
                  request('/admin/artists/' + a.id, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      displayName: str(data, 'displayName'),
                      bio: str(data, 'bio'),
                      styles: str(data, 'styles')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      theme: str(data, 'theme'),
                      studioId: str(data, 'studioId'),
                      published: checked(data, 'published'),
                      booksOpen: checked(data, 'booksOpen'),
                    }),
                  })
                }
              />
              {a.role === 'artist' && (
                <div className="artist-delete">
                  {confirm ? (
                    <>
                      <p>
                        Remove {a.display_name} from the artist directory and prevent new bookings?
                        Their account will be restricted and past appointment records will remain
                        available.
                      </p>
                      {error && (
                        <p role="alert" className="field-error">
                          {error}
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="dark"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError('');
                          try {
                            await request('/admin/artists/' + a.id, { method: 'DELETE' });
                            await refresh();
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Confirm delete artist
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
                      Delete artist
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
export function ArtistDirectory() {
  const query = useApi<{ artists: ManagedArtist[] }>('/admin/artists');
  const profile = useApi<ProfileData>('/profile');
  const [search, setSearch] = useState('');
  const artists =
    query.data?.artists.filter((a) =>
      (a.display_name + ' ' + a.studio_name + ' ' + a.email)
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <section className="workspace-card">
      <h2>Artist directory</h2>
      <p>
        Edit artist profiles and photographs, manage their services and working hours, and control
        who clients can book.
      </p>
      <div className="staff-actions">
        <Button asChild>
          <Link to="/admin?tab=users">Create artist account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin?tab=studio">Manage studio profiles</Link>
        </Button>
      </div>
      <input
        aria-label="Search artists"
        placeholder="Find an artist or studio"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {query.isPending || profile.isPending ? (
        <Loading />
      ) : query.isError || profile.isError ? (
        <Failure
          message={(query.error || profile.error)?.message || 'Artists could not be loaded.'}
        />
      ) : artists.length ? (
        artists.map((a) => <ArtistCard key={a.id} artist={a} studios={profile.data.studios} />)
      ) : (
        <Empty
          title="No artists found."
          text="Create an artist account or try a different search."
        />
      )}
    </section>
  );
}
