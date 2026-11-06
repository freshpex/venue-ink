import { HttpError } from './validation.mjs';
import { canManageStudio } from './domain.mjs';

export async function assignService(db, values, user) {
  const studio = (await db.query('SELECT id FROM venue_app.studios WHERE id=$1', [values.studioId]))
    .rows[0];
  if (!studio) throw new HttpError(404, 'Studio not found.');
  const ownProfile =
    user.role === 'artist'
      ? (
          await db.query(
            'SELECT studio_id FROM venue_app.artist_profiles WHERE user_id=$1 AND deleted_at IS NULL',
            [user.id],
          )
        ).rows[0]
      : null;
  const managesStudio = await canManageStudio(db, values.studioId, user);
  if (!managesStudio && ownProfile?.studio_id !== values.studioId)
    throw new HttpError(403, 'You cannot add services to this studio.');
  const artistId =
    values.artistId === undefined
      ? ownProfile?.studio_id === values.studioId
        ? user.id
        : null
      : values.artistId;
  if (!managesStudio && artistId !== user.id)
    throw new HttpError(403, 'You can manage your own artist services only.');
  if (
    artistId &&
    !(
      await db.query(
        "SELECT 1 FROM venue_app.artist_profiles a JOIN venue_app.users u ON u.id=a.user_id WHERE a.user_id=$1 AND a.studio_id=$2 AND a.deleted_at IS NULL AND u.active=true AND u.role IN ('artist','admin')",
        [artistId, values.studioId],
      )
    ).rowCount
  )
    throw new HttpError(400, 'Choose an active artist from this studio.');
  return artistId;
}
export async function managesService(db, service, user) {
  if (await canManageStudio(db, service.studio_id, user)) return true;
  return (
    user.role === 'artist' &&
    service.artist_id === user.id &&
    !!(
      await db.query(
        'SELECT 1 FROM venue_app.artist_profiles WHERE user_id=$1 AND studio_id=$2 AND deleted_at IS NULL',
        [user.id, service.studio_id],
      )
    ).rowCount
  );
}
