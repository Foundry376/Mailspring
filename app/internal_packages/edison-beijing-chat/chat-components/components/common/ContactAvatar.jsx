import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { gradientColorForString } from '../../utils/colors';
import { getAvatar, getAvatarFromCache, queryProfile, getProfile } from '../../utils/restjs';
import { connect } from 'react-redux';
import keyMannager from '../../../../../src/key-manager';
import _ from 'underscore';
import { getMyAppById } from '../../utils/appmgt';

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

class ContactAvatar extends Component {
  constructor(props) {
    super(props);
    this.refreshState(props);
  }

  state = {};

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
      bgColor
    };

    const imgUrl = getAvatarFromCache(this.props.email);
    if (props.jid.match(/@app/)) {
      const conv = props.conversation;
      if (conv) {
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
    const { availableUsers, jid } = this.props;
    return availableUsers && availableUsers.indexOf(jid) !== -1 ? 'online' : 'offline';
  }
  shouldComponentUpdate(nextProps, nextState) {
    const { availableUsers, jid } = this.props;
    if (_.isEqual(nextState, this.state)
      && nextProps.jid === jid
      && _.isEqual(nextProps.availableUsers, availableUsers)) {
      return false;
    }
    return true;
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
    const { avatar, isImgExist, userProfile, bgColor } = this.state;
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
        {!isGroup ? (
          <div className={this.isOnline()}></div>
        ) : null}
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

const mapStateToProps = (state) => ({
  availableUsers: state.contact.availableUsers
})

export default connect(mapStateToProps)(ContactAvatar);
