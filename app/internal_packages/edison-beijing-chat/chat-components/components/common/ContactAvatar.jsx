import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { gradientColorForString } from '../../utils/colors';
import { getAvatar, getAvatarFromCache, queryProfile } from '../../utils/restjs';
import { connect } from 'react-redux';
import keyMannager from '../../../../../src/key-manager';
import _ from 'underscore';

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
    this.state = {
      avatar: props.avatar ? `url(https://s3.us-east-2.amazonaws.com/edison-profile-stag/${props.avatar})` : gradientColorForString(props.jid),
      isImgExist: false,
      userProfile: {}
    }
    const imgUrl = getAvatarFromCache(this.props.email);
    if (imgUrl) {
      this.state.avatar = `url("${imgUrl}") center center / cover`;
      this.state.isImgExist = true;
    }
  }
  isOnline = () => {
    const { availableUsers, jid } = this.props;
    return availableUsers && availableUsers.indexOf(jid) !== -1 ? 'online' : 'offline';
  }
  getProfile = async () => {
    const chatAccounts = AppEnv.config.get('chatAccounts') || {};
    if (Object.keys(chatAccounts).length > 0) {
      const accessToken = await keyMannager.getAccessTokenByEmail(Object.keys(chatAccounts)[0]);
      const userId = this.props.jid.split('@')[0];
      return await new Promise((resolve, reject) => {
        queryProfile({ accessToken, userId }, (error, data) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        })
      });
    }
    return null;
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
    let { email, conversation } = this.props;
    if (this.props.jid && !email && (!conversation || !conversation.isGroup)) {
      const { data: userProfile } = await this.getProfile();
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
            avatar: `url("${imgUrl}") center center / cover`,
            isImgExist: true
          })
        }
      })
    }
  }
  render() {
    const { name, size = 48, conversation } = this.props;
    const { avatar, isImgExist, userProfile } = this.state;
    const isGroup = conversation && conversation.isGroup;
    const contactName = name || userProfile.name;
    return (
      <div
        className="chat-avatar"
        style={{
          height: size,
          width: size,
          minWidth: size,
          minHeight: size,
          fontSize: size / 2 - 1,
          borderRadius: size / 2,
          background: avatar
        }}
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
