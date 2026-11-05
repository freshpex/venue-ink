import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { SaveForm, str, checked, options } from './Forms';
import { useApi, useSession, useRefresh, assetUrl } from '../../lib/queries';
import { request } from '../../lib/api';
import { uploadImage } from '../../lib/upload';
import type { Artist, Studio, Asset } from '../../lib/types';
import { Failure, Loading } from '../../components/AsyncState';
import { Button } from '../../components/ui/button';
export type ProfileData = {
  profile: Artist | null;
  studios: Studio[];
  availability: { weekday: number; start_time: string; end_time: string }[];
};
export function AccountPanel() {
  const session = useSession();
  const query = useApi<ProfileData>('/profile');
  const assets = useApi<{ assets: Asset[] }>('/assets');
  const client = useQueryClient();
  const refresh = useRefresh();
  const [uploading, setUploading] = useState(false);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  const profile = query.data.profile;
  return (
    <div className="workspace-columns">
      <section className="workspace-card">
        <h2>Your account.</h2>
        <SaveForm
          fields={[{ name: 'name', label: 'Your name', value: session.data?.name, required: true }]}
          onSave={async (data) => {
            await request('/account', {
              method: 'PATCH',
              body: JSON.stringify({ name: str(data, 'name') }),
            });
            await client.invalidateQueries({ queryKey: ['session'] });
          }}
        />
        <h3>Change password</h3>
        <SaveForm
          fields={[
            { name: 'current', label: 'Current password', type: 'password', required: true },
            { name: 'next', label: 'New password', type: 'password', required: true },
            {
              name: 'code',
              label: 'Authenticator or recovery code',
              hint: 'Required when two-factor authentication is enabled.',
            },
          ]}
          label="Update password"
          onSave={async (data) => {
            await request('/auth/password', {
              method: 'PATCH',
              body: JSON.stringify({
                currentPassword: String(data.get('current') || ''),
                newPassword: String(data.get('next') || ''),
                code: str(data, 'code'),
              }),
            });
          }}
        />
      </section>
      {profile && (
        <section className="workspace-card">
          <h2>Your artist page.</h2>
          <Link className="arrow-link" to={'/artists/' + profile.slug}>
            {profile.published ? 'Open public page' : 'Page is not published'}
            <ArrowUpRight size={16} />
          </Link>
          <SaveForm
            key={JSON.stringify(profile)}
            fields={[
              {
                name: 'displayName',
                label: 'Artist name',
                value: profile.display_name,
                required: true,
              },
              { name: 'bio', label: 'About your work', type: 'textarea', value: profile.bio },
              {
                name: 'styles',
                label: 'Styles, separated by commas',
                value: profile.styles.join(', '),
              },
              {
                name: 'theme',
                label: 'Page theme',
                type: 'select',
                value: profile.theme,
                options: options(['paper', 'ink', 'lavender']),
              },
              {
                name: 'published',
                label: 'Publish my artist page',
                type: 'checkbox',
                value: profile.published,
              },
              {
                name: 'booksOpen',
                label: 'Open for booking requests',
                type: 'checkbox',
                value: profile.books_open,
              },
            ]}
            onSave={(data) =>
              request('/profile', {
                method: 'PUT',
                body: JSON.stringify({
                  displayName: str(data, 'displayName'),
                  bio: str(data, 'bio'),
                  styles: str(data, 'styles')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  theme: str(data, 'theme'),
                  published: checked(data, 'published'),
                  booksOpen: checked(data, 'booksOpen'),
                }),
              })
            }
          />
          <label className="upload-button">
            {uploading ? 'Uploading your image…' : 'Upload profile photograph'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  const asset = await uploadImage(file);
                  await request('/profile', {
                    method: 'PUT',
                    body: JSON.stringify({
                      displayName: profile.display_name,
                      bio: profile.bio,
                      styles: profile.styles,
                      theme: profile.theme,
                      published: profile.published,
                      booksOpen: profile.books_open,
                      imageAssetId: asset.id,
                    }),
                  });
                  refresh();
                  toast.success('Profile photograph saved');
                } catch (error) {
                  toast.error((error as Error).message);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </section>
      )}
      <section className="workspace-card">
        <h2>Your images.</h2>
        <p>
          Booking references and artwork stay in your account. Images in use are protected from
          deletion.
        </p>
        <div className="asset-grid">
          {assets.data?.assets.map((asset) => (
            <div key={asset.id}>
              <img src={assetUrl(asset.url)} alt={asset.filename} />
              <span>{asset.filename}</span>
              <Button
                variant="outline"
                size="small"
                onClick={async () => {
                  try {
                    await request('/assets/' + asset.id, { method: 'DELETE' });
                    refresh();
                    toast.success('Unused image removed');
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Remove unused image
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
export function AvailabilityPanel() {
  const query = useApi<ProfileData>('/profile');
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  return (
    <section className="workspace-card">
      <h2>Make room in your week.</h2>
      <p>
        Clients see available starts within these hours, using your studio’s time zone. Confirmed
        appointments are excluded.
      </p>
      <SaveForm
        key={JSON.stringify(query.data.availability)}
        fields={[
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ].flatMap((day, index) => {
          const rule = query.data.availability.find((h) => h.weekday === index);
          return [
            { name: 'open' + index, label: day, type: 'checkbox' as const, value: !!rule },
            {
              name: 'start' + index,
              label: day + ' opening',
              type: 'time' as const,
              value: rule?.start_time.slice(0, 5) || '10:00',
            },
            {
              name: 'end' + index,
              label: day + ' closing',
              type: 'time' as const,
              value: rule?.end_time.slice(0, 5) || '18:00',
            },
          ];
        })}
        onSave={(data) =>
          request('/availability', {
            method: 'PUT',
            body: JSON.stringify({
              hours: Array.from({ length: 7 }, (_, weekday) => ({
                weekday,
                startTime: str(data, 'start' + weekday),
                endTime: str(data, 'end' + weekday),
              })).filter((h) => checked(data, 'open' + h.weekday)),
            }),
          })
        }
      />
    </section>
  );
}
