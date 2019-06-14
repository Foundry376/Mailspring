import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { gradientColorForString } from '../../../utils/colors';
import { getAvatar, getAvatarFromCache, getProfile } from '../../../utils/restjs';
import _ from 'underscore';
import { getMyAppById } from '../../../utils/appmgt';
import { ChatActions, OnlineUserStore } from 'chat-exports';

const getInitials = name => {
  const trimmedName = name ? name.trim() : '';
  const nameParts = trimmedName.split(' ');
  if (!nameParts.length) {
    return '';
  }
  let initials = nameParts[0].charAt(0);
  if (nameParts.length > 1) {
    initials += nameParts[nameParts.length - 1].charAt(0);
  }
  return initials;
};

export default class ContactAvatar extends Component {
  constructor(props) {
    super(props);
    this.refreshState(props);
    this._listenToStore();
  }

  _listenToStore() {
    this._unsub = ChatActions.userOnlineStatusChanged.listen(this._onDataChanged, this);
  }

  componentWillUnmount() {
    this._unsub();
  }

  _onDataChanged = (jid) => {
    if (jid === this.props.jid) {
      this.setState({
        isOnline: this.isOnline()
      });
    }
  }

  componentWillReceiveProps = nextProps => {
    this.refreshState(nextProps);
  };

  refreshState = props => {
    const bgColor = gradientColorForString(props.jid);
    let app;
    const state = {
      avatar: props.avatar ? `https://s3.us-east-2.amazonaws.com/edison-profile-stag/${props.avatar}` : bgColor,
      isImgExist: false,
      userProfile: {},
      bgColor,
      isOnline: this.isOnline()
    };

    const imgUrl = getAvatarFromCache(this.props.email);
    if (props.jid.match(/@app/)) {
      const conv = props.conversation;
      if (conv && conv.curJid) {
        const userId = conv.curJid.split('@')[0];
        const id = props.jid.split('@')[0];
        app = getMyAppById(userId, id);
      }
    }
    if (imgUrl) {
      state.avatar = imgUrl;
      state.isImgExist = true;
    } else if (app) {
      state.avatar = app.icon;
      state.isImgExist = true;
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
    let { email, conversation } = this.props;
    if (this.props.jid && !email && (!conversation || !conversation.isGroup)) {
      let userProfile;
      try {
        const { data } = await getProfile(this.props.jid);
        userProfile = data;
      } catch (e) {
        console.log('error in getProfile:', e);
      }
      if (userProfile) {
        email = userProfile.email
        this.setState({
          userProfile: userProfile || {}
        })
      }
    }
    if (email && !this.props.avatar && !this.state.isImgExist) {
      getAvatar(email, imgUrl => {
        if (imgUrl) {
          this.setState({
            avatar: imgUrl,
            isImgExist: true
          })
        }
      })
    }
    this.refreshState(this.props);
  }

  render() {
    const { name, size = 48, conversation } = this.props;
    const { avatar, isImgExist, userProfile, bgColor, isOnline } = this.state;
    const isGroup = conversation && conversation.isGroup;
    const contactName = name || userProfile.name;
    const styles = {
      height: size,
      width: size,
      minWidth: size,
      minHeight: size,
      fontSize: size / 2 - 1,
      borderRadius: size / 2,
      background: bgColor
    }
    if (isImgExist) {
      styles.backgroundImage = `url(${avatar})`;
      styles.backgroundSize = 'cover';
    }
    return (
      <div
        className="chat-avatar"
        style={styles}
        title={contactName}
      >
        {isImgExist ? null : getInitials(contactName).toUpperCase()}
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
