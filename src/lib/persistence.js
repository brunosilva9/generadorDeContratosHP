import { get, set, del } from 'idb-keyval';

const KEY = 'gen-contratos-state-v1';

// Templates carry ArrayBuffer; IndexedDB serializes them via structured clone.
// If the stored size grows huge, this will reject — caller falls back gracefully.
export async function saveState(state) {
  try {
    await set(KEY, state);
  } catch (err) {
    // QuotaExceeded or serialization failure — drop binaries and retry.
    try {
      const slim = {
        ...state,
        templates: (state.templates ?? []).map((t) => ({ ...t, buffer: null })),
      };
      await set(KEY, slim);
    } catch {
      // Persistence is best-effort; never throw to callers.
      console.warn('No se pudo persistir el estado:', err);
    }
  }
}

export async function loadState() {
  try {
    return (await get(KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function clearState() {
  try {
    await del(KEY);
  } catch {
    // ignore
  }
}
