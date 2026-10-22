// The page Views the user pinned to the nav rail, in rail order. Pinning is the only thing
// that puts a View in the rail; every View, pinned or not, is listed on the Views home.
const PINS_CONFIG_KEY = 'core.views.pinned';

export function pinnedViewIds(): string[] {
  const ids = AppEnv.config.get(PINS_CONFIG_KEY);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
}

export function isPinned(viewId: string) {
  return pinnedViewIds().includes(viewId);
}

export function setPinned(viewId: string, pinned: boolean) {
  const ids = pinnedViewIds().filter((id) => id !== viewId);
  AppEnv.config.set(PINS_CONFIG_KEY, pinned ? [...ids, viewId] : ids);
}

/** Calls `callback` whenever the pinned set changes. Returns an unsubscribe. */
export function onPinsChanged(callback: () => void): () => void {
  const disposable = AppEnv.config.onDidChange(PINS_CONFIG_KEY, callback);
  return () => disposable.dispose();
}
