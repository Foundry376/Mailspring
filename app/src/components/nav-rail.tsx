import React from 'react';
import { ipcRenderer } from 'electron';
import {
  localized,
  ComponentRegistry,
  WorkspaceStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';
import { RetinaImg } from './retina-img';
import { InjectedComponentSet } from './injected-component-set';

type NavRailItemProps = {
  label: string;
  iconName: string;
  isActive: () => boolean;
} & (
  | {
      /** An application: command, so the rail, the Window menu and the shortcut take one path. */
      command: string;
    }
  | {
      /** Shown as a native popup menu in place of running a command. */
      menuTemplate: () => Electron.MenuItemConstructorOptions[];
    }
);

export class NavRailItem extends React.Component<NavRailItemProps, { active: boolean }> {
  static displayName = 'NavRailItem';

  _unlisten?: () => void;

  state = { active: this.props.isActive() };

  componentDidMount() {
    this._unlisten = WorkspaceStore.listen(() => this.setState({ active: this.props.isActive() }));
  }

  componentWillUnmount() {
    this._unlisten?.();
  }

  _onClick = () => {
    if ('menuTemplate' in this.props) {
      const { Menu } = require('@electron/remote');
      Menu.buildFromTemplate(this.props.menuTemplate()).popup({});
    } else {
      ipcRenderer.send('command', this.props.command);
    }
  };

  render() {
    const { label, iconName } = this.props;
    const { active } = this.state;
    return (
      <button
        className={`btn-icon nav-rail-item${active ? ' active' : ''}`}
        title={label}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        aria-haspopup={'menuTemplate' in this.props ? 'menu' : undefined}
        onClick={this._onClick}
      >
        <RetinaImg name={iconName} mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}

/** Plugins add a section with the `NavRail:Item` role, or `NavRail:FooterItem` to pin it to the bottom. */
export class NavRail extends React.Component {
  static displayName = 'NavRail';

  render() {
    return (
      <nav className="nav-rail" aria-label={localized('Sections')}>
        <InjectedComponentSet
          matching={{ role: 'NavRail:Item' }}
          direction="column"
          height="auto"
          style={{ flex: 1 }}
          containersRequired={false}
        />
        <InjectedComponentSet
          matching={{ role: 'NavRail:FooterItem' }}
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
    isActive={() => FocusedPerspectiveStore.isShowingMail()}
  />
);
MailNavRailItem.displayName = 'MailNavRailItem';

ComponentRegistry.register(MailNavRailItem, { role: 'NavRail:Item' });
