import React from 'react';
import classnames from 'classnames';
import { localized, ComponentRegistry } from 'mailspring-exports';

export const SIDEBAR_PANEL_ROLE = 'MessageListSidebar:Panel';
const CONTACT_PANEL_ID = 'contact';
const ACTIVE_PANEL_CONFIG_KEY = 'core.messageListSidebar.panel';

type PanelComponent = React.ComponentType<{ active: boolean }> & {
  sidebarPanel: { id: string; title: string };
};

interface SidebarPanelsState {
  panels: PanelComponent[];
  activeId: string;
}

/**
 * The switcher at the top of the thread sidebar. The default "Contact" panel is everything
 * registered at the MessageListSidebar location (participant picker, contact cards, card-mode
 * Views). Anything registered for the `MessageListSidebar:Panel` role with a static
 * `sidebarPanel = { id, title }` becomes another choice that fills the whole sidebar instead.
 *
 * Every panel stays mounted while the sidebar is open and receives `active`, so a panel with
 * expensive state (a View's webview) survives switching away and back. With no extra panels
 * registered, nothing renders and the sidebar looks exactly as it did before.
 */
export class SidebarPanels extends React.Component<Record<string, unknown>, SidebarPanelsState> {
  static displayName = 'SidebarPanels';
  static containerStyles = { flexShrink: 0 };

  _unlisten: () => void;
  _configDisposable: { dispose: () => void };

  state: SidebarPanelsState = {
    panels: this._findPanels(),
    activeId: AppEnv.config.get(ACTIVE_PANEL_CONFIG_KEY) || CONTACT_PANEL_ID,
  };

  componentDidMount() {
    this._unlisten = ComponentRegistry.listen(() => this.setState({ panels: this._findPanels() }));
    this._configDisposable = AppEnv.config.onDidChange(ACTIVE_PANEL_CONFIG_KEY, ({ newValue }) =>
      this.setState({ activeId: newValue || CONTACT_PANEL_ID })
    );
  }

  componentWillUnmount() {
    this._unlisten();
    this._configDisposable.dispose();
  }

  _findPanels(): PanelComponent[] {
    return (
      ComponentRegistry.findComponentsMatching({
        role: SIDEBAR_PANEL_ROLE,
      }) as PanelComponent[]
    ).filter((c) => c.sidebarPanel && c.sidebarPanel.id);
  }

  _onSelect = (id: string) => {
    AppEnv.config.set(ACTIVE_PANEL_CONFIG_KEY, id);
  };

  render() {
    const { panels } = this.state;
    if (panels.length === 0) return null;

    // A remembered panel whose provider has since been removed falls back to Contact.
    const activeId = panels.some((p) => p.sidebarPanel.id === this.state.activeId)
      ? this.state.activeId
      : CONTACT_PANEL_ID;
    const choices = [
      { id: CONTACT_PANEL_ID, title: localized('Contact') },
      ...panels.map((p) => p.sidebarPanel),
    ];

    return (
      <div
        className={classnames('sidebar-panels', { 'panel-active': activeId !== CONTACT_PANEL_ID })}
      >
        <div className="sidebar-panel-switcher" role="tablist">
          {choices.map(({ id, title }) => (
            <button
              key={id}
              role="tab"
              aria-selected={id === activeId}
              className={classnames('sidebar-panel-tab', { active: id === activeId })}
              onClick={() => this._onSelect(id)}
              title={title}
            >
              {title}
            </button>
          ))}
        </div>
        {panels.map((Panel) => {
          const active = Panel.sidebarPanel.id === activeId;
          return (
            <div
              key={Panel.sidebarPanel.id}
              className="sidebar-panel"
              role="tabpanel"
              style={{ display: active ? 'flex' : 'none' }}
            >
              <Panel active={active} />
            </div>
          );
        })}
      </div>
    );
  }
}
