import React, { Component } from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';
import {
  localized,
  DateUtils,
  Actions,
  Message,
  SyncbackMetadataTask,
  TaskQueue,
  SendDraftTask,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { PLUGIN_ID } from './send-later-constants';

const { DATE_FORMAT_SHORT } = DateUtils;

interface SendLaterStatusProps {
  draft: Message;
}
interface SendLaterStatusState {
  task: SendDraftTask;
}

export default class SendLaterStatus extends Component<SendLaterStatusProps, SendLaterStatusState> {
  static displayName = 'SendLaterStatus';

  static propTypes = {
    draft: PropTypes.object,
  };

  _unlisten?: () => void;

  constructor(props) {
    super(props);
    this.state = this.getStateFromStores(props);
  }

  componentDidMount() {
    this._unlisten = TaskQueue.listen(() => {
      this.setState(this.getStateFromStores(this.props));
    });
  }

  componentWillReceiveProps(nextProps) {
    this.setState(this.getStateFromStores(nextProps));
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }
  }

  onCancelSendLater = () => {
    Actions.queueTask(
      SyncbackMetadataTask.forSaving({
        model: this.props.draft,
        pluginId: PLUGIN_ID,
        value: { expiration: null },
      })
    );
  };

  getStateFromStores({ draft }) {
    return {
      task: TaskQueue.findTasks(
        SendDraftTask,
        { headerMessageId: draft.headerMessageId },
        { includeCompleted: true }
      ).pop() as SendDraftTask,
    };
  }

  render() {
    const metadata = this.props.draft.metadataForPluginId(PLUGIN_ID);
    if (!metadata || !metadata.expiration) {
      return <span />;
    }

    const { expiration } = metadata;

    let label = null;
    if (expiration > new Date(Date.now() + 60 * 1000)) {
      label = localized(
        `Scheduled for %@`,
        DateUtils.format(moment(expiration), DATE_FORMAT_SHORT)
      );
    } else {
      label = localized(`Sending in a few seconds`) + '...';
      if (this.state.task) {
        label = localized(`Sending now`) + '...';
      }
    }

    return (
      <div className="send-later-status">
        <span className="time">{label}</span>
        <RetinaImg
          name="image-cancel-button.png"
          title={localized('Cancel Send Later')}
          onClick={this.onCancelSendLater}
          mode={RetinaImg.Mode.ContentPreserve}
        />
      </div>
    );
  }
}
