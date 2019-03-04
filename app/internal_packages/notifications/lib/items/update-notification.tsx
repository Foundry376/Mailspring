import { localized, React } from 'mailspring-exports';
import { ipcRenderer, remote, shell } from 'electron';
import { Notification } from 'mailspring-component-kit';
import { Disposable } from 'event-kit';

interface UpdateNotificationState {
  updateAvailable: boolean;
  version: string;
  updateIsManual: boolean;
}

export default class UpdateNotification extends React.Component<{}, UpdateNotificationState> {
  static displayName = 'UpdateNotification';

  disposable?: Disposable;

  constructor(props) {
    super(props);
    this.state = this.getStateFromStores();
  }

  componentDidMount() {
    this.disposable = AppEnv.onUpdateAvailable(() => {
      this.setState(this.getStateFromStores());
    });
  }

  componentWillUnmount() {
    this.disposable.dispose();
  }

  getStateFromStores() {
    const updater = remote.getGlobal('application').autoUpdateManager;
    const updateAvailable = updater.getState() === 'update-available';
    const info = updateAvailable ? updater.getReleaseDetails() : {};
    return {
      updateAvailable,
      updateIsManual: info.releaseNotes === 'manual-download',
      version: info.releaseVersion,
    };
  }

  _onUpdate = () => {
    ipcRenderer.send('command', 'application:install-update');
  };

  _onViewChangelog = () => {
    shell.openExternal('https://github.com/Foundry376/Mailspring/releases/latest');
  };

  render() {
    const { updateAvailable, version, updateIsManual } = this.state;

    if (!updateAvailable) {
      return <span />;
    }
    return (
      <Notification
        priority="4"
        title={localized(
          `An update to Mailspring is available %@`,
          version ? `(${version.replace('Mailspring', '').trim()})` : ''
        )}
        subtitle={localized('View changelog')}
        subtitleAction={this._onViewChangelog}
        icon="volstead-upgrade.png"
        actions={[
          {
            label: updateIsManual ? localized('Download Now') : localized('Install'),
            fn: this._onUpdate,
          },
        ]}
      />
    );
  }
}
