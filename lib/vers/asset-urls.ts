export const ASSET_URL_TTL_SECONDS = 15 * 60;
const RENEW_BEFORE_MS = 60_000;
export type AssetUrlLease = { path: string; expiresAt: number };

// The regular campaign/scene refresh renews URLs before they expire. Never
// retain a URL after its expiry when authorization or signing fails.
export async function refreshAssetUrls(
  rows: Array<{ id: string; storage_path: string }>,
  urls: Record<string, string>,
  leases: Record<string, AssetUrlLease>,
  sign: (path: string, ttl: number) => Promise<string | undefined>,
  now = Date.now(),
) {
  await Promise.all(rows.map(async (asset) => {
    const lease = leases[asset.id];
    const samePath = lease?.path === asset.storage_path;
    if (urls[asset.id] && samePath && lease.expiresAt > now + RENEW_BEFORE_MS) return;
    const url = await sign(asset.storage_path, ASSET_URL_TTL_SECONDS);
    if (url) {
      urls[asset.id] = url;
      leases[asset.id] = { path: asset.storage_path, expiresAt: now + ASSET_URL_TTL_SECONDS * 1000 };
    } else if (!samePath || !lease || lease.expiresAt <= now) {
      delete urls[asset.id];
      delete leases[asset.id];
    }
  }));
  return urls;
}
