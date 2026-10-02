/** Something displaying a View that can reload it in place. Implemented by ViewHost. */
export interface ReloadableHost {
  viewId: string;
  reloadView(): void;
  /** The View's own pixels (no host chrome), or null when its page isn't showing. */
  capturePage(): Promise<Electron.NativeImage | null>;
}

const hosts = new Set<ReloadableHost>();

export function registerHost(host: ReloadableHost) {
  hosts.add(host);
  return () => hosts.delete(host);
}

export function hostsFor(viewId: string) {
  return [...hosts].filter((h) => h.viewId === viewId);
}

/** Reloads every mounted copy of the View. Returns how many were reloaded. */
export function reloadMountedView(viewId: string) {
  const matching = hostsFor(viewId);
  matching.forEach((h) => h.reloadView());
  return matching.length;
}
