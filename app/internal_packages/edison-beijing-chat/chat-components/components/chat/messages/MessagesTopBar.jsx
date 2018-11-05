import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import TopBar from '../../common/TopBar';
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
  onToggleInvite = () => {
    this.props.toggleInvite();
    this.setState({ inviting: !this.state.inviting });
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
                { selectedConversation.isGroup && <div style={{ float:'left', border:"1px solid black", backgroundColor:"lightgray", position:'relative', right:'-265px' }} onTouchTap={exitGroup}>
                  {"exit" }
                </div>
                }
                { selectedConversation.isGroup && <div style={{ float:'left', border:"1px solid black", backgroundColor:"lightgray", position:'relative', right:'-280px' }} onTouchTap={toggleInvite}>
                  {inviting? "cancel": "invite" }
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
      </div>
    );
  }
}
