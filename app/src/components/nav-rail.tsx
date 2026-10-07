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

interface NavRailItemProps {
  label: string;
  iconName: string;
  /** An application: command, so the rail, the Window menu and the shortcut take one path. */
  command: string;
  isActive: () => boolean;
}

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

  render() {
    const { label, iconName, command } = this.props;
    const { active } = this.state;
    return (
      <button
        className={`btn-icon nav-rail-item${active ? ' active' : ''}`}
        title={label}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={() => ipcRenderer.send('command', command)}
      >
        <RetinaImg name={iconName} mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}

/** Plugins add a section with the `NavRail:Item` role. */
export class NavRail extends React.Component {
  static displayName = 'NavRail';

  render() {
    return (
      <nav className="nav-rail" aria-label={localized('Sections')}>
        <InjectedComponentSet
          matching={{ role: 'NavRail:Item' }}
          direction="column"
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
