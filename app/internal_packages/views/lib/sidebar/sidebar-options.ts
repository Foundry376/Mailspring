import { ViewManifest } from '../view-registry';

export interface SidebarOptions {
  /**
   * `card` sits among the contact cards inside host-drawn card chrome. `panel` takes over the
   * whole sidebar and is chosen from the switcher at the top of it.
   */
  mode: 'card' | 'panel';
  title: string | null;
}

/** Reads the manifest's optional `sidebar` block. Anything malformed falls back to a card. */
export function sidebarOptionsFor(view: ViewManifest): SidebarOptions {
  const sidebar = view.json && view.json.sidebar;
  const mode = sidebar && sidebar.mode === 'panel' ? 'panel' : 'card';
  const title =
    sidebar && typeof sidebar.title === 'string' && sidebar.title.trim()
      ? sidebar.title.trim().slice(0, 60)
      : null;
  return { mode, title };
}
