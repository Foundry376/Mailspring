import { localized, React } from 'mailspring-exports';
import { Notification } from 'mailspring-component-kit';

export default class DevModeNotification extends React.Component {
  static displayName = 'DevModeNotification';

  constructor() {
    super();
    // Don't need listeners to update this, since toggling dev mode reloads
    // the entire window anyway
    this.state = {
      inDevMode: AppEnv.inDevMode(),
    };
  }

  render() {
    if (!this.state.inDevMode) {
      return <span />;
    }
    return (
      <Notification
        priority="0"
        title={localized('Mailspring is running in dev mode and may be slower!')}
      />
    );
  }
}
