import { React } from 'mailspring-exports';
import { ipcRenderer, remote } from 'electron';
import { Notification } from 'mailspring-component-kit';

export default class UpdateNotification extends React.Component {
  static displayName = 'UpdateNotification';

  constructor() {
    super();
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
    // zhansheng: TODO need replace our changelog link
    // remote.shell.openExternal('https://github.com/agent8/Mailspring/releases/latest');
  };

  render() {
    const { updateAvailable, version, updateIsManual } = this.state;

    if (!updateAvailable) {
      return <span />;
    }
    return (
      <Notification
        priority="4"
        title={`An update to EdisonMail is available ${
          version ? `(${version.replace('EdisonMail', '').trim()})` : ''
          }`}
        subtitle="View changelog"
        subtitleAction={this._onViewChangelog}
        icon="volstead-upgrade.png"
        actions={[
          {
            label: updateIsManual ? 'Download Now' : 'Install Update',
            fn: this._onUpdate,
          },
        ]}
      />
    );
  }
}
