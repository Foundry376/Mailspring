import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { buildTimeDescriptor } from '../../../utils/time';
import ContactAvatar from '../../common/ContactAvatar';

export default class ConversationItem extends PureComponent {

  static propTypes = {
    selected: PropTypes.bool,
    conversation: PropTypes.shape({
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,//.isRequired,
      avatar: PropTypes.string,
      lastMessageText: PropTypes.string.isRequired,
      lastMessageTime: PropTypes.number.isRequired,
    }).isRequired,
    referenceTime: PropTypes.number,
  }

  static defaultProps = {
    selected: false,
    referenceTime: new Date().getTime(),
  }

  render() {
    const { selected, conversation, referenceTime, ...otherProps } = this.props;
    const timeDescriptor = buildTimeDescriptor(referenceTime);

    return (
      <div className={'item' + (selected ? ' selected' : '')} {...otherProps}>
        < ContactAvatar name={conversation.name} jid={conversation.jid} />
        <div className="content">
          <div className="headerRow">
            <span className="headerText">{conversation.name}</span>
            <span className="headerSecondaryText">
              {timeDescriptor(conversation.lastMessageTime)}
            </span>
          </div>
          <div className="subHeader">{conversation.lastMessageText}</div>
        </div>
      </div >
    );
  }
}
