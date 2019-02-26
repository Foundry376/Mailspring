import { localized, React, UpdateChannelStore } from 'mailspring-exports';
import { Notification } from 'mailspring-component-kit';

export default class UnstableChannelNotification extends React.Component {
  static displayName = 'UnstableChannelNotification';

  constructor() {
    super();
    this.state = {
      isUnstableChannel: UpdateChannelStore.currentIsUnstable(),
    };
  }

  componentDidMount() {
    this._unsub = UpdateChannelStore.listen(() => {
      this.setState({
        isUnstableChannel: UpdateChannelStore.currentIsUnstable(),
      });
    });
  }

  componentWillUnmount() {
    if (this._unsub) {
      this._unsub();
    }
  }

  _onReportIssue = () => {
    AppEnv.windowEventHandler.openLink({ href: 'mailto:support@getmailspring.com' });
  };

  render() {
    if (!this.state.isUnstableChannel) {
      return <span />;
    }
    return (
      <Notification
        priority="0"
        displayName={UnstableChannelNotification.displayName}
        title={localized("You're on a pre-release channel. We'd love your feedback.")}
        subtitle={localized('You can switch back to stable from the preferences.')}
        icon="volstead-defaultclient.png"
        actions={[
          {
            label: localized('Feedback'),
            fn: this._onReportIssue,
          },
        ]}
        isDismissable
        isPermanentlyDismissable
      />
    );
  }
}
