import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import TopBar from '../../common/TopBar';
import ContactAvatar from '../../common/ContactAvatar';
import BackIcon from '../../common/icons/BackIcon';
import InfoIcon from '../../common/icons/InfoIcon';
import { theme } from '../../../utils/colors';
import xmpp from '../../../xmpp';
import GroupChatAvatar from '../../common/GroupChatAvatar';

const privateStatus = (availableUsers, conversationJid) =>
  (availableUsers.indexOf(conversationJid) >= 0 ? 'Online' : 'Offline');

const groupStatus = (availableUsers, occupants) => {
  const available = new Set(availableUsers);
  const onlineCount = occupants.map(occupant => (available.has(occupant) ? 1 : 0))
    .reduce((total, current) => total + current, 0);
  return `${onlineCount} Online`;
};

export default class MessagesTopBar extends Component {
  static propTypes = {
    onBackPressed: PropTypes.func,
    onInfoPressed: PropTypes.func,
    availableUsers: PropTypes.arrayOf(PropTypes.string),
    infoActive: PropTypes.bool,
    selectedConversation: PropTypes.shape({
      isGroup: PropTypes.bool.isRequired,
      jid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      email: PropTypes.string,//.isRequired,
      avatar: PropTypes.string,
      occupants: PropTypes.arrayOf(PropTypes.string).isRequired,
    }),
  }
  static defaultProps = {
    onBackPressed: () => { },
    onInfoPressed: () => { },
    availableUsers: [],
    infoActive: false,
    selectedConversation: null,
  }
  constructor(props) {
    super();
    this.state = { inviting: false }
  }
  onToggleInvite = () => {
    this.props.toggleInvite();
    this.setState({ inviting: !this.state.inviting });
  }
  _onkeyDown = (e) => {
    if (e.keyCode === 13) {
      e.currentTarget.blur();
      this.saveRoomName(e.currentTarget.innerText);
      e.preventDefault();
    }
  }

  _onBlur = (e) => {
    this.saveRoomName(e.currentTarget.innerText);
  }

  async saveRoomName(name) {
    const { selectedConversation } = this.props;
    if (name && name !== selectedConversation.name) {
      await xmpp.setRoomName(selectedConversation.jid, {
        name
      })
      selectedConversation.update({
        $set: { name }
      })
    }
  }

  render() {
    const {
      availableUsers,
      infoActive,
      selectedConversation,
      onBackPressed,
      onInfoPressed,
      inviting,
      toggleInvite,
      exitGroup,
    } = this.props;
    const conversationJid = selectedConversation.jid;
    const conversation = selectedConversation;

    return (
      <div>
        <TopBar
          left={
            <div
              contentEditable={conversation.isGroup}
              dangerouslySetInnerHTML={{ __html: conversation.name }}
              onKeyDown={this._onkeyDown}
              onBlur={this._onBlur}
              className="conversationName">
            </div>
          }
          // center={
          //   <div className="chatTopBarCenter">
          //     <div style={{ width: '100%' }}>
          //       <div className="onlineIndicatior">
          //         {selectedConversation.isGroup ?
          //           groupStatus(availableUsers, selectedConversation.occupants) :
          //           privateStatus(availableUsers, conversationJid)
          //         }
          //       </div>
          //     </div>
          //   </div>
          // }
          right={
            <div>
              {/* {selectedConversation.isGroup && <div id="exit-button" onClick={exitGroup}>
                exit
              </div>
              }
              {selectedConversation.isGroup && <div id="invite-button" onClick={toggleInvite}>
                {inviting ? "cancel" : "invite"}
              </div>
              } */}
              <div id="open-info" onClick={() => onInfoPressed()}>
                {conversation.isGroup ?
                  <GroupChatAvatar conversation={conversation} size={26} /> :
                  <ContactAvatar conversation={conversation} jid={conversation.jid} name={conversation.name}
                                 email={conversation.email} avatar={conversation.avatar} size={26} />
                }
              </div>
            </div>
          }
        />
      </div>
    );
  }
}
