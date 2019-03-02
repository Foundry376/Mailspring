import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import moment from 'moment';
import {
  localized,
  Actions,
  FeatureUsageStore,
  Message,
  DraftEditingSession,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

import SendLaterPopover from './send-later-popover';
import { PLUGIN_ID } from './send-later-constants';

function sendLaterDateForDraft(draft) {
  return ((draft && draft.metadataForPluginId(PLUGIN_ID)) || {}).expiration;
}

interface SendLaterButtonProps {
  draft: Message;
  session: DraftEditingSession;
  isValidDraft: () => boolean;
}

interface SendLaterButtonState {
  saving: boolean;
}

class SendLaterButton extends Component<SendLaterButtonProps, SendLaterButtonState> {
  static displayName = 'SendLaterButton';

  static containerRequired = false;

  static propTypes = {
    draft: PropTypes.object.isRequired,
    session: PropTypes.object.isRequired,
    isValidDraft: PropTypes.func,
  };

  mounted = false;

  state = {
    saving: false,
  };

  componentDidMount() {
    this.mounted = true;
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (nextState.saving !== this.state.saving) {
      return true;
    }
    if (sendLaterDateForDraft(nextProps.draft) !== sendLaterDateForDraft(this.props.draft)) {
      return true;
    }
    return false;
  }

  componentDidUpdate(prevProps) {
    if (
      this.state.saving &&
      sendLaterDateForDraft(prevProps.draft) !== sendLaterDateForDraft(this.props.draft)
    ) {
      this.setState({ saving: false });
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  onAssignSendLaterDate = async (sendLaterDate, dateLabel) => {
    if (!this.props.isValidDraft()) {
      return;
    }
    Actions.closePopover();

    const currentSendLaterDate = sendLaterDateForDraft(this.props.draft);
    if (currentSendLaterDate === sendLaterDate) {
      return;
    }

    // Only check for feature usage and record metrics if this draft is not
    // already set to send later.
    if (!currentSendLaterDate) {
      try {
        await FeatureUsageStore.markUsedOrUpgrade('send-later', {
          headerText: localized('All Scheduled Sends Used'),
          rechargeText: `${localized(
            `You can schedule sending of %1$@ emails each %2$@ with Mailspring Basic.`
          )} ${localized('Upgrade to Pro today!')}`,
          iconUrl: 'mailspring://send-later/assets/ic-send-later-modal@2x.png',
        });
      } catch (error) {
        if (error instanceof FeatureUsageStore.NoProAccessError) {
          return;
        }
      }

      this.setState({ saving: true });
    }

    this.props.session.changes.addPluginMetadata(PLUGIN_ID, {
      expiration: sendLaterDate,
    });

    if (AppEnv.isComposerWindow()) {
      AppEnv.close();
    }
  };

  onCancelSendLater = () => {
    Actions.closePopover();
    this.props.session.changes.addPluginMetadata(PLUGIN_ID, {
      expiration: null,
    });
  };

  onClick = () => {
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(
      <SendLaterPopover
        sendLaterDate={sendLaterDateForDraft(this.props.draft)}
        onAssignSendLaterDate={this.onAssignSendLaterDate}
        onCancelSendLater={this.onCancelSendLater}
      />,
      { originRect: buttonRect, direction: 'up' }
    );
  };

  render() {
    let className = 'btn btn-toolbar btn-send-later';

    if (this.state.saving) {
      return (
        <button
          className={className}
          title={localized('Saving send date...')}
          tabIndex={-1}
          style={{ order: -99 }}
        >
          <RetinaImg
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentDark}
            style={{ width: 14, height: 14 }}
          />
        </button>
      );
    }

    let sendLaterLabel: JSX.Element = null;
    const sendLaterDate = sendLaterDateForDraft(this.props.draft);

    if (sendLaterDate) {
      className += ' btn-enabled';
      if (sendLaterDate > new Date()) {
        sendLaterLabel = (
          <span className="at">
            {localized('Sending in %@', moment(sendLaterDate).fromNow(true))}
          </span>
        );
      } else {
        sendLaterLabel = <span className="at">{localized('Sending now')}</span>;
      }
    }
    return (
      <button
        className={className}
        title={localized('Send Later') + '…'}
        onClick={this.onClick}
        tabIndex={-1}
        style={{ order: -99 }}
      >
        <RetinaImg name="icon-composer-sendlater.png" mode={RetinaImg.Mode.ContentIsMask} />
        {sendLaterLabel}
        <span>&nbsp;</span>
        <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}

export default SendLaterButton;
