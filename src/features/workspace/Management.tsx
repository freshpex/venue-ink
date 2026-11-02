import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Loading, Failure, Empty } from '../../components/AsyncState';
import { SaveForm, str, num, cents, checked } from './Forms';
import type { Field } from './Forms';
import { useApi, useSession, useRefresh, assetUrl, money, dateTime } from '../../lib/queries';
import { request } from '../../lib/api';
import { uploadImage } from '../../lib/upload';
import type { Service, FlashDesign, Asset, VenueEvent } from '../../lib/types';
import type { ProfileData } from './AccountPanel';
type Member = {
  id: string;
  studio_id: string;
  display_name: string;
  email: string;
  studio_name: string;
  published: boolean;
};
export function StudioSettings() {
  const query = useApi<ProfileData>('/profile');
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  return (
    <div className="workspace-columns">
      {query.data.studios.map((studio) => (
        <section className="workspace-card" key={studio.id}>
          <h2>{studio.name}</h2>
          <Link className="arrow-link" to={'/studio/' + studio.slug}>
            Studio page ↗
          </Link>
          <SaveForm
            fields={[
              { name: 'name', label: 'Studio name', value: studio.name, required: true },
              { name: 'bio', label: 'About the studio', type: 'textarea', value: studio.bio },
              { name: 'location', label: 'Studio address', value: studio.location },
              {
                name: 'timezone',
                label: 'Time zone',
                value: studio.timezone,
                hint: 'Use an IANA time zone such as Europe/Amsterdam.',
                required: true,
              },
              {
                name: 'published',
                label: 'Publish studio page',
                type: 'checkbox',
                value: studio.published,
              },
            ]}
            onSave={(data) =>
              request('/studios/' + studio.id, {
                method: 'PATCH',
                body: JSON.stringify({
                  name: str(data, 'name'),
                  bio: str(data, 'bio'),
                  location: str(data, 'location'),
                  timezone: str(data, 'timezone'),
                  published: checked(data, 'published'),
                }),
              })
            }
          />
        </section>
      ))}
    </div>
  );
}
export function ServicesPanel() {
  const query = useApi<{ services: Service[] }>('/workspace/services');
  const profile = useApi<ProfileData>('/profile');
  const [selected, setSelected] = useState<Service | null>(null);
  const studioOptions = profile.data?.studios.map((s) => ({ value: s.id, label: s.name })) || [];
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  const fields: Field[] = [
    {
      name: 'studio',
      label: 'Studio',
      type: 'select',
      value: selected?.studio_id || studioOptions[0]?.value,
      options: studioOptions,
      required: true,
    },
    { name: 'name', label: 'Service name', value: selected?.name, required: true },
    {
      name: 'category',
      label: 'Category',
      value: selected?.category || 'Tattooing',
      required: true,
    },
    { name: 'description', label: 'Description', type: 'textarea', value: selected?.description },
    {
      name: 'duration',
      label: 'Duration in minutes',
      type: 'number',
      value: selected?.duration_minutes || 60,
      min: 15,
      max: 480,
      required: true,
    },
    {
      name: 'price',
      label: 'Price in USD (leave empty for an individual quote)',
      type: 'number',
      value: selected?.price_cents == null ? '' : selected.price_cents / 100,
      min: 0,
      step: '0.01',
    },
    {
      name: 'deposit',
      label: 'Deposit in USD',
      type: 'number',
      value: (selected?.deposit_cents || 0) / 100,
      min: 0,
      step: '0.01',
    },
    {
      name: 'active',
      label: 'Available to clients',
      type: 'checkbox',
      value: selected?.active ?? true,
    },
  ];
  return (
    <div className="workspace-columns">
      <section className="workspace-card">
        <h2>Your service menu.</h2>
        {query.data.services.map((item) => (
          <button className="entity-row" key={item.id} onClick={() => setSelected(item)}>
            <span>
              <strong>{item.name}</strong>
              <small>
                {item.studio_name} · {item.duration_minutes} minutes ·{' '}
                {item.active ? 'Active' : 'Hidden'}
              </small>
            </span>
            <span>{money(item.price_cents)} ↗</span>
          </button>
        ))}
        <Button variant="outline" onClick={() => setSelected(null)}>
          Add a service
        </Button>
      </section>
      <section className="workspace-card">
        <h2>{selected ? 'Edit service' : 'Add a service'}</h2>
        {studioOptions.length ? (
          <SaveForm
            key={selected?.id || 'new'}
            fields={fields}
            onSave={async (data) => {
              await request('/workspace/services' + (selected ? '/' + selected.id : ''), {
                method: selected ? 'PUT' : 'POST',
                body: JSON.stringify({
                  studioId: str(data, 'studio'),
                  name: str(data, 'name'),
                  description: str(data, 'description'),
                  category: str(data, 'category'),
                  durationMinutes: num(data, 'duration'),
                  priceCents: cents(data, 'price'),
                  depositCents: cents(data, 'deposit') || 0,
                  active: checked(data, 'active'),
                }),
              });
              setSelected(null);
            }}
          />
        ) : (
          <p>Your studio owner manages the shared service menu.</p>
        )}
      </section>
    </div>
  );
}
export function TeamPanel() {
  const query = useApi<{
    members: Member[];
    invitations: {
      id: string;
      email: string;
      expires_at: string;
      accepted_at: string | null;
      studio_name: string;
    }[];
  }>('/team');
  const profile = useApi<ProfileData>('/profile');
  const refresh = useRefresh();
  const [link, setLink] = useState('');
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  return (
    <div className="workspace-columns">
      <section className="workspace-card">
        <h2>The people making it happen.</h2>
        {query.data.members.map((member) => (
          <div className="entity-row" key={member.id}>
            <span>
              <strong>{member.display_name}</strong>
              <small>
                {member.email} · {member.studio_name}
              </small>
            </span>
            <span>{member.published ? 'Published' : 'Not published'}</span>
          </div>
        ))}
        <h3>Invitations</h3>
        {query.data.invitations.map((invite) => (
          <div className="entity-row" key={invite.id}>
            <span>
              {invite.email}
              <small>
                {invite.accepted_at ? 'Accepted' : 'Expires ' + dateTime(invite.expires_at)}
              </small>
            </span>
            {!invite.accepted_at && (
              <Button
                variant="outline"
                size="small"
                onClick={async () => {
                  try {
                    await request('/team/invitations/' + invite.id, { method: 'DELETE' });
                    refresh();
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
      </section>
      <section className="workspace-card">
        <h2>Invite an artist.</h2>
        <p>
          Create a private invitation link for the artist’s email address. Share it with them; the
          link expires in seven days.
        </p>
        <SaveForm
          fields={[
            {
              name: 'studio',
              label: 'Studio',
              type: 'select',
              options: profile.data?.studios.map((s) => ({ value: s.id, label: s.name })),
              required: true,
            },
            { name: 'email', label: 'Artist email address', type: 'email', required: true },
          ]}
          label="Create invitation"
          onSave={async (data) => {
            const result = await request<{ token: string }>('/team/invitations', {
              method: 'POST',
              body: JSON.stringify({ email: str(data, 'email'), studioId: str(data, 'studio') }),
            });
            setLink(
              location.origin + '/register?role=artist&invite=' + encodeURIComponent(result.token),
            );
          }}
        />
        {link && (
          <div className="invitation-result">
            <label>
              Invitation link
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  toast.success('Invitation copied');
                } catch {
                  toast.error('Select and copy the link above.');
                }
              }}
            >
              Copy invitation
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
export function ArtworkPanel() {
  const query = useApi<{ designs: FlashDesign[] }>('/workspace/flash');
  const assets = useApi<{ assets: Asset[] }>('/assets');
  const session = useSession();
  const refresh = useRefresh();
  const [selected, setSelected] = useState<FlashDesign | null>(null);
  const [uploading, setUploading] = useState(false);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  const fields: Field[] = [
    { name: 'title', label: 'Artwork title', value: selected?.title, required: true },
    {
      name: 'description',
      label: 'About the piece',
      type: 'textarea',
      value: selected?.description,
    },
    {
      name: 'category',
      label: 'Collection / style',
      value: selected?.category || 'Original flash',
      required: true,
    },
    {
      name: 'asset',
      label: 'Your artwork image',
      type: 'select',
      value: selected?.asset_id,
      options: [
        { value: '', label: 'Choose an uploaded image' },
        ...(assets.data?.assets.map((a) => ({ value: a.id, label: a.filename })) || []),
      ],
      required: true,
    },
    {
      name: 'price',
      label: 'Price in USD (empty for individual quote)',
      type: 'number',
      value: selected?.price_cents == null ? '' : selected.price_cents / 100,
      min: 0,
      step: '0.01',
    },
    { name: 'size', label: 'Size', value: selected?.size_note },
    { name: 'placement', label: 'Placement', value: selected?.placement_note },
    {
      name: 'repeatable',
      label: 'This design can be repeated',
      type: 'checkbox',
      value: selected?.repeatable,
    },
    {
      name: 'published',
      label: 'Publish this artwork',
      type: 'checkbox',
      value: selected?.published,
    },
    {
      name: 'archived',
      label: 'Archive this artwork',
      type: 'checkbox',
      value: selected?.archived,
    },
  ];
  return (
    <div className="workspace-columns">
      <section className="workspace-card">
        <h2>Your original work.</h2>
        {query.data.designs.map((design) => (
          <button key={design.id} className="entity-row" onClick={() => setSelected(design)}>
            <img className="row-thumb" src={assetUrl(design.image_url)} alt="" />
            <span>
              <strong>{design.title}</strong>
              <small>
                {design.artist_name} ·{' '}
                {design.archived ? 'Archived' : design.published ? 'Published' : 'Not published'}
              </small>
            </span>
            <span>↗</span>
          </button>
        ))}
        {!query.data.designs.length && (
          <Empty
            title="Room for your next collection."
            text="Upload your artwork, add the details and choose when to publish."
          />
        )}
        <Button variant="outline" onClick={() => setSelected(null)}>
          Add artwork
        </Button>
      </section>
      <section className="workspace-card">
        <h2>{selected ? 'Edit artwork' : 'A new piece'}</h2>
        <label className="upload-button">
          {uploading ? 'Uploading…' : 'Upload original artwork'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                await uploadImage(file);
                await refresh();
                toast.success('Image uploaded. Choose it below.');
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        <SaveForm
          key={selected?.id || 'new'}
          fields={fields}
          onSave={async (data) => {
            await request('/workspace/flash' + (selected ? '/' + selected.id : ''), {
              method: selected ? 'PUT' : 'POST',
              body: JSON.stringify({
                artistId: selected?.artist_id || session.data?.id,
                title: str(data, 'title'),
                description: str(data, 'description'),
                category: str(data, 'category'),
                assetId: str(data, 'asset'),
                priceCents: cents(data, 'price'),
                sizeNote: str(data, 'size'),
                placementNote: str(data, 'placement'),
                repeatable: checked(data, 'repeatable'),
                published: checked(data, 'published'),
                archived: checked(data, 'archived'),
              }),
            });
            setSelected(null);
          }}
        />
      </section>
    </div>
  );
}
function localDate(value?: string) {
  return value
    ? new Date(+new Date(value) - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
}
export function EventsPanel() {
  const query = useApi<{ events: VenueEvent[] }>('/workspace/events');
  const services = useApi<{ services: Service[] }>('/workspace/services');
  const profile = useApi<ProfileData>('/profile');
  const team = useApi<{ members: Member[] }>('/team');
  const [selected, setSelected] = useState<VenueEvent | null>(null);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  return (
    <div className="workspace-columns">
      <section className="workspace-card">
        <h2>Your studio gatherings.</h2>
        {query.data.events.map((event) => (
          <button className="entity-row" key={event.id} onClick={() => setSelected(event)}>
            <span>
              <strong>{event.title}</strong>
              <small>
                {dateTime(event.starts_at)} · {event.published ? 'Published' : 'Not published'}
              </small>
            </span>
            ↗
          </button>
        ))}
        <Button variant="outline" onClick={() => setSelected(null)}>
          Create an event
        </Button>
      </section>
      <section className="workspace-card">
        <h2>{selected ? 'Edit event' : 'Plan a gathering'}</h2>
        <SaveForm
          key={selected?.id || 'new'}
          fields={[
            {
              name: 'studio',
              label: 'Studio',
              type: 'select',
              value: selected?.studio_id,
              options: profile.data?.studios.map((s) => ({ value: s.id, label: s.name })),
              required: true,
            },
            {
              name: 'artist',
              label: 'Artist',
              type: 'select',
              value: selected?.artist_id,
              options: team.data?.members.map((m) => ({
                value: m.id,
                label: m.display_name + ' · ' + m.studio_name,
              })),
              required: true,
            },
            {
              name: 'service',
              label: 'Service',
              type: 'select',
              value: selected?.service_id,
              options: services.data?.services
                .filter((s) => s.active)
                .map((s) => ({ value: s.id, label: s.name + ' · ' + s.studio_name })),
              required: true,
            },
            { name: 'title', label: 'Event name', value: selected?.title, required: true },
            {
              name: 'description',
              label: 'About the day',
              type: 'textarea',
              value: selected?.description,
            },
            { name: 'location', label: 'Location', value: selected?.location },
            {
              name: 'start',
              label: 'Starts (your browser time zone)',
              type: 'datetime-local',
              value: localDate(selected?.starts_at),
              required: true,
            },
            {
              name: 'end',
              label: 'Ends (your browser time zone)',
              type: 'datetime-local',
              value: localDate(selected?.ends_at),
              required: true,
            },
            {
              name: 'capacity',
              label: 'Maximum confirmed bookings',
              type: 'number',
              value: selected?.capacity || 10,
              min: 1,
              max: 200,
              required: true,
            },
            {
              name: 'published',
              label: 'Publish this event',
              type: 'checkbox',
              value: selected?.published,
            },
          ]}
          onSave={async (data) => {
            await request('/workspace/events' + (selected ? '/' + selected.id : ''), {
              method: selected ? 'PUT' : 'POST',
              body: JSON.stringify({
                studioId: str(data, 'studio'),
                artistId: str(data, 'artist'),
                serviceId: str(data, 'service'),
                title: str(data, 'title'),
                description: str(data, 'description'),
                location: str(data, 'location'),
                startsAt: new Date(str(data, 'start')).toISOString(),
                endsAt: new Date(str(data, 'end')).toISOString(),
                capacity: num(data, 'capacity'),
                published: checked(data, 'published'),
              }),
            });
            setSelected(null);
          }}
        />
      </section>
    </div>
  );
}
