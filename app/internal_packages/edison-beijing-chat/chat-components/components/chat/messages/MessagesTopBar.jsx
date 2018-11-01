import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import TopBar from '../../common/TopBar';
import InviteGroupChatList from '../new/InviteGroupChatList';
import BackIcon from '../../common/icons/BackIcon';
import InfoIcon from '../../common/icons/InfoIcon';
import { theme } from '../../../utils/colors';
import xmpp from '../../../xmpp';
import conversation from '../../../db/schemas/conversation';

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
  constructor() {
    super();
    this.state = { inviting: false }
  }

  onInvite = () => {
    this.setState({inviting: true});
  }

  onUpdateGroup = (contacts) => {
    this.setState(Object.assign({}, this.state, { inviting: false }));
    const {selectedConversation} = this.props;
    debugger;
    for (const i in contacts) {
      xmpp.addMember(selectedConversation.jid, contacts[i].jid);
    }
  }


  render() {
    const {
      availableUsers,
      infoActive,
      selectedConversation,
      onBackPressed,
      onInfoPressed,
    } = this.props;
    const conversationJid = selectedConversation.jid;

    return (
      <div>
        <TopBar
          left={
            <div className="backButtonContainer">
              <Button onTouchTap={() => onBackPressed()}>
                <BackIcon color={theme.primaryColor} />
              </Button>
            </div>
          }
          center={
            <div className="chatTopBarCenter">
              <div style={{ width: '100%' }}>
                <div className="conversationName" style={{ float:'left', margin:"0 2px" }}>{selectedConversation.name}</div>
                <div className="onlineIndicatior" style={{ float:'left', margin:"0 2px" }}>
                  {selectedConversation.isGroup ?
                    groupStatus(availableUsers, selectedConversation.occupants) :
                    privateStatus(availableUsers, conversationJid)
                  }
                </div>
                { selectedConversation.isGroup && <div style={{ float:'left', border:"1px solid black", backgroundColor:"lightgray", position:'relative', right:'-380px' }} onTouchTap={() => this.onInvite()}>
                  invite
                </div>
                }
              </div>
            </div>
          }
          right={
            <Button onTouchTap={() => onInfoPressed()}>
              <InfoIcon active={infoActive} color={theme.primaryColor} />
            </Button>
          }
        />
        {this.state.inviting && <InviteGroupChatList groupMode={true} onUpdateGroup = {this.onUpdateGroup}></InviteGroupChatList>}
      </div>
    );
  }
}
