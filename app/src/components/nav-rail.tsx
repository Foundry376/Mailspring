import React from 'react';
import ReactDOM from 'react-dom';
import { ipcRenderer } from 'electron';
import {
  localized,
  ComponentRegistry,
  WorkspaceStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';
import { RetinaImg } from './retina-img';
import { InjectedComponentSet } from './injected-component-set';

export interface NavRailTooltipContent {
  title: string;
  description?: string;
}

interface NavRailItemProps {
  label: string;
  /** A bundled image drawn as a mask in the rail's icon colour. */
  iconName?: string;
  /** Drawn instead when there's no `iconName`, e.g. an emoji or a monogram. */
  icon?: React.ReactNode;
  /** An application: command, so the rail, the Window menu and the shortcut take one path. */
  command?: string;
  /** For items with no application: command. */
  onClick?: () => void;
  /** Re-evaluated whenever WorkspaceStore triggers. Ignored when `active` is passed. */
  isActive?: () => boolean;
  /** For items whose active state depends on more than the sheet stack. */
  active?: boolean;
  /** Shown beside the rail on hover and focus; defaults to the label. */
  tooltip?: NavRailTooltipContent;
  /** A count drawn on the item's corner; hidden when zero or null. */
  badge?: number | null;
}

interface NavRailItemState {
  active: boolean;
  tooltipAt: { left: number; top: number } | null;
}

const TOOLTIP_DELAY_MS = 350;
let nextTooltipId = 0;

export class NavRailItem extends React.Component<NavRailItemProps, NavRailItemState> {
  static displayName = 'NavRailItem';

  _unlisten?: () => void;
  _button = React.createRef<HTMLButtonElement>();
  _tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  _tooltipId = `nav-rail-tooltip-${nextTooltipId++}`;

  state: NavRailItemState = { active: this._computeActive(), tooltipAt: null };

  componentDidMount() {
    this._unlisten = WorkspaceStore.listen(() => this.setState({ active: this._computeActive() }));
  }

  componentDidUpdate(prev: NavRailItemProps) {
    if (prev.active !== this.props.active) this.setState({ active: this._computeActive() });
  }

  componentWillUnmount() {
    this._unlisten?.();
    if (this._tooltipTimer) clearTimeout(this._tooltipTimer);
  }

  _computeActive() {
    if (typeof this.props.active === 'boolean') return this.props.active;
    return this.props.isActive ? this.props.isActive() : false;
  }

  _showTooltipSoon = () => {
    if (this._tooltipTimer || this.state.tooltipAt) return;
    this._tooltipTimer = setTimeout(() => {
      this._tooltipTimer = null;
      const el = this._button.current;
      if (!el || !el.isConnected) return;
      const rect = el.getBoundingClientRect();
      this.setState({ tooltipAt: { left: rect.right + 8, top: rect.top + rect.height / 2 } });
    }, TOOLTIP_DELAY_MS);
  };

  _hideTooltip = () => {
    if (this._tooltipTimer) clearTimeout(this._tooltipTimer);
    this._tooltipTimer = null;
    if (this.state.tooltipAt) this.setState({ tooltipAt: null });
  };

  _onClick = () => {
    this._hideTooltip();
    if (this.props.onClick) this.props.onClick();
    else if (this.props.command) ipcRenderer.send('command', this.props.command);
  };

  _renderTooltip(tooltip: NavRailTooltipContent) {
    const { tooltipAt } = this.state;
    if (!tooltipAt) return null;
    // Portaled to the body: the rail clips its overflow, and the tooltip sits over the sheets.
    return ReactDOM.createPortal(
      <div
        id={this._tooltipId}
        role="tooltip"
        className="nav-rail-tooltip"
        style={{ left: tooltipAt.left, top: tooltipAt.top }}
      >
        <div className="nav-rail-tooltip-title">{tooltip.title}</div>
        {tooltip.description ? (
          <div className="nav-rail-tooltip-description">{tooltip.description}</div>
        ) : null}
      </div>,
      document.body
    );
  }

  render() {
    const { label, iconName, icon, badge } = this.props;
    const tooltip = this.props.tooltip || { title: label };
    const { active, tooltipAt } = this.state;
    return (
      <button
        ref={this._button}
        className={`btn-icon nav-rail-item${active ? ' active' : ''}`}
        aria-label={label}
        aria-describedby={tooltipAt ? this._tooltipId : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={this._onClick}
        onMouseEnter={this._showTooltipSoon}
        onMouseLeave={this._hideTooltip}
        onFocus={this._showTooltipSoon}
        onBlur={this._hideTooltip}
      >
        {iconName ? (
          <RetinaImg name={iconName} mode={RetinaImg.Mode.ContentIsMask} />
        ) : (
          <span className="nav-rail-item-glyph" aria-hidden="true">
            {icon}
          </span>
        )}
        {badge ? (
          <span className="nav-rail-item-badge" aria-hidden="true">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
        {this._renderTooltip(tooltip)}
      </button>
    );
  }
}

/**
 * A group of rail items below the main sections, set apart by a divider. Plugins with more
 * than one item register a component with the `NavRail:Section` role that renders one of these.
 */
export const NavRailSection: React.FunctionComponent<{ label: string }> = ({ label, children }) => (
  <div className="nav-rail-section" role="group" aria-label={label}>
    {children}
  </div>
);
NavRailSection.displayName = 'NavRailSection';

/**
 * Plugins add a section with the `NavRail:Item` role, or a group of items after a divider
 * with the `NavRail:Section` role (see NavRailSection). The rail scrolls when it overflows.
 */
export class NavRail extends React.Component {
  static displayName = 'NavRail';

  render() {
    return (
      <nav className="nav-rail" aria-label={localized('Sections')}>
        <InjectedComponentSet
          matching={{ role: 'NavRail:Item' }}
          direction="column"
          height="auto"
          containersRequired={false}
        />
        <InjectedComponentSet
          matching={{ role: 'NavRail:Section' }}
          direction="column"
          height="auto"
          containersRequired={false}
        />
      </nav>
    );
  }
}

const MailNavRailItem = () => (
  <NavRailItem
    label={localized('Mail')}
    iconName="inbox.png"
    command="application:show-mail"
    isActive={() =>
      FocusedPerspectiveStore.isShowingMail() &&
      WorkspaceStore.topSheet() !== WorkspaceStore.Sheet.Preferences
    }
  />
);
MailNavRailItem.displayName = 'MailNavRailItem';

ComponentRegistry.register(MailNavRailItem, { role: 'NavRail:Item' });
