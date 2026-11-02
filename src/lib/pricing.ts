export function estimateCosts(volume: number, activeArtists = 5) {
  const safeVolume = Math.min(
    1e7,
    Math.max(0, Number.isFinite(volume) ? volume : 0),
  );
  const artists = Math.min(
    100,
    Math.max(1, Math.floor(Number.isFinite(activeArtists) ? activeArtists : 5)),
  );
  return {
    solo: Math.round(safeVolume * 0.1 * 100) / 100,
    soloPro: Math.round((50 + safeVolume * 0.05) * 100) / 100,
    studioPro:
      Math.round(
        (150 + Math.max(0, artists - 5) * 35 + safeVolume * 0.05) * 100,
      ) / 100,
  };
}
