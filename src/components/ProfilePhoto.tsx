import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AssetImage } from './AssetImage';
import { Button } from './ui/button';
import { prepareImage } from '../lib/upload';
import { request } from '../lib/api';
import { useRefresh } from '../lib/queries';

export function ProfileAvatar({
  name,
  image,
  large = false,
}: {
  name: string;
  image?: string | null;
  large?: boolean;
}) {
  return (
    <span className={'avatar profile-avatar' + (large ? ' large' : '')}>
      {image ? (
        <AssetImage path={image} alt={name + ' profile photo'} />
      ) : (
        name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
          .toUpperCase()
      )}
    </span>
  );
}
export function ProfilePhotoEditor({
  name,
  image,
  endpoint,
}: {
  name: string;
  image?: string | null;
  endpoint: string;
}) {
  const [busy, setBusy] = useState(false);
  const refresh = useRefresh();
  const client = useQueryClient();
  async function changed() {
    await refresh();
    await client.invalidateQueries({ queryKey: ['session'] });
  }
  return (
    <div className="profile-photo-editor">
      <ProfileAvatar name={name} image={image} large />
      <div>
        <label className="upload-button">
          {busy ? 'Saving photograph…' : 'Upload profile photograph'}
          <input
            aria-label={'Profile photograph for ' + name}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={async (event) => {
              const input = event.currentTarget,
                file = input.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                await request(endpoint, {
                  method: 'PUT',
                  body: JSON.stringify(await prepareImage(file)),
                });
                await changed();
                toast.success('Profile photograph saved');
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                input.value = '';
                setBusy(false);
              }
            }}
          />
        </label>
        <small>JPEG, PNG or WebP. Your photograph appears on profiles and booking cards.</small>
        {image && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request(endpoint, { method: 'DELETE' });
                await changed();
                toast.success('Profile photograph removed');
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove photograph
          </Button>
        )}
      </div>
    </div>
  );
}
