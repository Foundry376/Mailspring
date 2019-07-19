import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { gradientColorForString } from '../../utils/colors';
import _ from 'underscore';
import { getMyAppById } from '../../utils/appmgt';
import { ChatActions, OnlineUserStore, UserCacheStore } from 'chat-exports';

const getInitials = name => {
  const trimmedName = name ? name.trim() : '';
  const nameParts = trimmedName.split(' ');
  if (!nameParts.length) {
    return '';
  }
  let initials = nameParts[0].charAt(0);
  // if (nameParts.length > 1) {
  //   initials += nameParts[nameParts.length - 1].charAt(0);
  // }
  return initials;
};

export default class ContactAvatar extends Component {
  constructor(props) {
    super(props);
    this.state = {};
    this._listenToStore();
  }

  _listenToStore() {
    this._unsub = ChatActions.userOnlineStatusChanged.listen(this._onDataChanged, this);
  }

  componentWillUnmount() {
    this.mounted = false;
    this._unsub();
  }

  _onDataChanged = (jid) => {
    if (jid === this.props.jid) {
      this.setState({
        isOnline: this.isOnline()
      });
    }
  }

  componentWillReceiveProps = async (nextProps) => {
    await this.refreshState(nextProps);
  };

  refreshState = async (props) => {
    const bgColor = gradientColorForString(props.jid);
    let app;
    await UserCacheStore.init();
    const state = {
      avatar: UserCacheStore.getAvatarByJid(props.jid),
      userInfo: UserCacheStore.getUserInfoByJid(props.jid),
      bgColor,
      isOnline: this.isOnline()
    };

    if (props.jid.match(/@app/)) {
      const conv = props.conversation;
      if (conv && conv.curJid) {
        const userId = conv.curJid.split('@')[0];
        const id = props.jid.split('@')[0];
        app = getMyAppById(userId, id);
      }
    }
    if (app) {
      state.avatar = app.icon;
    }
    if (this.mounted) {
      this.setState(state);
    } else {
      this.state = state;
    }
  };

  isOnline = () => {
    const { jid } = this.props;
    return OnlineUserStore.isUserOnline(jid);
  }

  componentDidMount = async () => {
    this.mounted = true;
    await this.refreshState(this.props);
  }

  _getContactName = () => {
    const { name } = this.props;
    const { userInfo } = this.state;
    const contactName = name || (userInfo && userInfo.name) || (userInfo && userInfo.email);
    return contactName;
  }

  render() {
    const { size = 48 } = this.props;
    const { avatar, bgColor, isOnline } = this.state;
    const contactName = this._getContactName();
    const styles = {
      height: size,
      width: size,
      minWidth: size,
      minHeight: size,
      fontSize: size / 2 - 1,
      borderRadius: size / 2,
      background: bgColor
    }
    let avatarStyles = {};
    if (avatar) {
      avatarStyles.backgroundImage = `url(${avatar})`;
      avatarStyles.backgroundSize = 'cover';
    }
    return (
      <div
        className="chat-avatar"
        style={styles}
        title={contactName}
      >
        <div className="avatar-image" style={avatarStyles}></div>
        <span>{getInitials(contactName).toUpperCase()}</span>
        <div className={isOnline ? 'online' : 'offline'}></div>
      </div>
    )
  }
}

ContactAvatar.propTypes = {
  jid: PropTypes.string.isRequired,
  name: PropTypes.string,
  email: PropTypes.string,
  avatar: PropTypes.string,
  size: PropTypes.number,
};

ContactAvatar.defaultProps = {
  size: 48,
};
