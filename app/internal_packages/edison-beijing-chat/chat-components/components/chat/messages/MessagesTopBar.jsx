import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import Button from '../../common/Button';
import TopBar from '../../common/TopBar';
import BackIcon from '../../common/icons/BackIcon';
import InfoIcon from '../../common/icons/InfoIcon';
import { theme } from '../../../utils/colors';

const privateStatus = (availableUsers, conversationJid) =>
  (availableUsers.indexOf(conversationJid) >= 0 ? 'Online' : 'Offline');

const groupStatus = (availableUsers, occupants) => {
  const available = new Set(availableUsers);
  const onlineCount = occupants.map(occupant => (available.has(occupant) ? 1 : 0))
    .reduce((total, current) => total + current, 0);
  return `${onlineCount} Online`;
};

export default class MessagesTopBar extends PureComponent {
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
            <div className="conversationName">{selectedConversation.name}</div>
            <div className="onlineIndicatior">
              {selectedConversation.isGroup ?
                groupStatus(availableUsers, selectedConversation.occupants) :
                privateStatus(availableUsers, conversationJid)
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
    );
  }
}
