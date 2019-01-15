import React from 'react';
import DoneIcon from '../internal_packages/edison-beijing-chat/chat-components/components/common/icons/DoneIcon';
import CancelIcon from '../internal_packages/edison-beijing-chat/chat-components/components/common/icons/CancelIcon';
import { theme } from '../internal_packages/edison-beijing-chat/chat-components/utils/colors';
import EmojiIcon from '../internal_packages/edison-beijing-chat/chat-components/components/common/icons/EmojiIcon';
import InfoIcon from '../internal_packages/edison-beijing-chat/chat-components/components/common/icons/InfoIcon';
const { primaryColor } = theme;

export default class VerticalToolbar extends React.Component {
  static displayName = 'VerticalToolbar';

  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    const style = {
      position: 'absolute',
      backgroundColor: 'lightgray',
      zIndex: 999,
      top: '32px',
      width: '32px',
      right: 0,
    };


    return (
      <div
        style={style}
        className={`vertical-toolbar-container`}
      >
        <DoneIcon color={primaryColor} />
        <CancelIcon color={primaryColor} />
        <EmojiIcon className="icon" />
        <InfoIcon className="icon" />
      </div>
    );
  }
}
