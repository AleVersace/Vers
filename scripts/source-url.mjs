/** Resolve only the public source link; never expose the build environment. */
export function resolveSourceUrl(value, commit) {
  if (!value?.trim()) return '';
  let source = value.trim();
  if (source.includes('{commit}')) {
    if (!/^[a-f0-9]{40}$/i.test(commit ?? '')) {
      throw new Error('The source URL template requires a full 40-character SOURCE_COMMIT or Vercel Git commit.');
    }
    source = source.replaceAll('{commit}', commit.toLowerCase());
  }
  let url;
  try { url = new URL(source); } catch { throw new Error('The source URL must be an absolute HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[{}]/.test(source)) {
    throw new Error('The source URL must be HTTP(S), without credentials or unresolved placeholders.');
  }
  return url.href;
}
