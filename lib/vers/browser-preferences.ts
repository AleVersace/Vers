type PreferenceStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem">;

// The origin belongs to this installation. Recover a uniquely named preference
// from a previous application namespace without deleting its old value: an open
// tab running the previous client can still use it until that tab is refreshed.
export function readBrowserPreference(storage: PreferenceStorage, key: string) {
  const current = storage.getItem(key);
  if (current !== null) return current;
  const separator = key.indexOf(":");
  if (separator < 1) return null;
  const suffix = key.slice(separator);
  const candidates: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const candidate = storage.key(index);
    if (candidate && candidate !== key && candidate.endsWith(suffix)) {
      candidates.push(candidate);
    }
  }
  // Ambiguous state should use the normal default rather than another app's
  // preference. Callers retain their existing value validation and defaults.
  if (candidates.length !== 1) return null;
  const recovered = storage.getItem(candidates[0]);
  if (recovered !== null) {
    try { storage.setItem(key, recovered); } catch { /* Reading still works when writes are blocked. */ }
  }
  return recovered;
}
