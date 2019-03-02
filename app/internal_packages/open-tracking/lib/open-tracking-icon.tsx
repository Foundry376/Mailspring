import React from 'react';
import ReactDOM from 'react-dom';
import { localized, PropTypes, Actions, Message, Thread } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import OpenTrackingMessagePopover from './open-tracking-message-popover';
import { PLUGIN_ID } from './open-tracking-constants';

export default class OpenTrackingIcon extends React.Component<{
  thread: Thread & { __messages: Message[] };
}> {
  static displayName = 'OpenTrackingIcon';

  static propTypes = {
    thread: PropTypes.object.isRequired,
  };

  onMouseDown = () => {
    const rect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    const { message } = this._getDataFromThread();
    Actions.openPopover(
      <OpenTrackingMessagePopover
        message={message}
        openMetadata={message.metadataForPluginId(PLUGIN_ID)}
      />,
      { originRect: rect, direction: 'down' }
    );
  };

  _getDataFromThread() {
    const messages = this.props.thread.__messages || [];

    let lastMessage = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].draft) {
        lastMessage = messages[i];
        break;
      }
    }

    if (!lastMessage) {
      return {
        message: null,
        opened: false,
        openCount: null,
        hasMetadata: false,
      };
    }

    const lastMessageMeta = lastMessage.metadataForPluginId(PLUGIN_ID);
    const hasMetadata = lastMessageMeta != null && lastMessageMeta.open_count != null;

    return {
      message: lastMessage,
      opened: hasMetadata && lastMessageMeta.open_count > 0,
      openCount: hasMetadata ? lastMessageMeta.open_count : null,
      hasMetadata: hasMetadata,
    };
  }

  render() {
    const { hasMetadata, opened, openCount } = this._getDataFromThread();

    if (!hasMetadata) return <span style={{ width: '19px' }} />;
    const noun = openCount === 1 ? localized('Open') : localized('Opens');
    const title = opened
      ? `${openCount} ${noun.toLocaleLowerCase()}`
      : localized('This message has not been opened');
    return (
      <div
        title={title}
        className="open-tracking-icon"
        onMouseDown={opened ? this.onMouseDown : null}
      >
        <RetinaImg
          className={opened ? 'opened' : 'unopened'}
          url="mailspring://open-tracking/assets/icon-tracking-opened@2x.png"
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    );
  }
}
