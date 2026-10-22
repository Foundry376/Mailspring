import React from 'react';
import { localized } from 'mailspring-exports';
import { NavRailItem, NavRailSection } from 'mailspring-component-kit';
import { ViewManifest, ViewRegistryEvents, allViews } from '../view-registry';
import { ViewsNavStore } from '../views-nav';
import { badgeFor, ViewBadgeEvents } from './badges';
import { onPinsChanged, pinnedViewIds } from './pins';

/** The Views that get their own rail item: pinned page Views, in the order they were pinned. */
export function railViews(views: ViewManifest[] = allViews(), pinned = pinnedViewIds()) {
  return pinned
    .map((id) => views.find((v) => v.id === id && v.placement === 'page'))
    .filter(Boolean);
}

// A manifest `icon` is a short emoji; anything else falls back to a monogram.
export function emojiIcon(icon: unknown): string | null {
  if (typeof icon !== 'string') return null;
  const trimmed = icon.trim();
  if (!trimmed || trimmed.length > 8) return null;
  if (!/\p{Extended_Pictographic}/u.test(trimmed) || /[\x21-\x7e]/.test(trimmed)) return null;
  return trimmed;
}

const MONOGRAM_HUES = [210, 265, 330, 15, 35, 150, 185, 235];

export function monogramFor(name: string) {
  const letter = (name.trim().match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = MONOGRAM_HUES[Math.abs(hash) % MONOGRAM_HUES.length];
  return { letter, background: `hsl(${hue}, 55%, 52%)` };
}

export function tooltipFor(view: ViewManifest) {
  const parts: string[] = [];
  const description = view.json && view.json.description;
  if (typeof description === 'string' && description.trim()) parts.push(description.trim());
  return { title: view.name, description: parts.join(' ') || undefined };
}

function ViewGlyph({ view }: { view: ViewManifest }) {
  const emoji = emojiIcon(view.json && view.json.icon);
  if (emoji) return <>{emoji}</>;
  const { letter, background } = monogramFor(view.name);
  return (
    <span className="nav-rail-monogram" style={{ background }}>
      {letter}
    </span>
  );
}

interface State {
  views: ViewManifest[];
  showing: boolean;
  viewId: string | null;
}

/** The rail's Views section: the Views home, then one item per page View. */
export class ViewsNavRailSection extends React.Component<Record<string, never>, State> {
  static displayName = 'ViewsNavRailSection';

  _unlisten: () => void;
  _unlistenPins: () => void;

  state: State = this._snapshot();

  componentDidMount() {
    this._unlisten = ViewsNavStore.listen(this._refresh);
    this._unlistenPins = onPinsChanged(this._refresh);
    ViewRegistryEvents.on('changed', this._refresh);
    ViewBadgeEvents.on('changed', this._refresh);
  }

  componentWillUnmount() {
    this._unlisten();
    this._unlistenPins();
    ViewRegistryEvents.removeListener('changed', this._refresh);
    ViewBadgeEvents.removeListener('changed', this._refresh);
  }

  _snapshot(): State {
    return {
      views: railViews(),
      showing: ViewsNavStore.isShowingViews(),
      viewId: ViewsNavStore.viewId(),
    };
  }

  _refresh = () => this.setState(this._snapshot());

  render() {
    const { views, showing, viewId } = this.state;
    // An unpinned View opened from the home has no item of its own, so the Views item stays lit.
    const viewHasItem = views.some((v) => v.id === viewId);
    return (
      <NavRailSection label={localized('Views')}>
        <NavRailItem
          label={localized('Views')}
          iconName="plugins.png"
          tooltip={{
            title: localized('Views'),
            description: localized('Your custom views of your mail, and the starters.'),
          }}
          active={showing && !viewHasItem}
          onClick={() => ViewsNavStore.showHome()}
        />
        {views.map((view) => (
          <NavRailItem
            key={view.id}
            label={view.name}
            icon={<ViewGlyph view={view} />}
            tooltip={tooltipFor(view)}
            badge={badgeFor(view.id)}
            active={showing && viewId === view.id}
            onClick={() => ViewsNavStore.showView(view.id)}
          />
        ))}
      </NavRailSection>
    );
  }
}
