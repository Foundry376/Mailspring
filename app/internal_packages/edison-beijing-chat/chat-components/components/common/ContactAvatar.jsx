import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { gradientColorForString } from '../../utils/colors';
import { getavatar } from '../../utils/restjs';

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
      isImgExist: false
    }
  }
  componentDidMount = () => {
    if (this.props.email && !this.props.avatar) {
      getavatar(this.props.email, (error, data, res) => {
        if (!res) {
          return;
        }
        if (res.statusCode >= 400) {
          return;
        }
        if (res.statusCode === 302) {
          const img = new Image();
          img.src = res.headers.location;
          img.onload = () => {
            this.setState({
              avatar: `url("${res.headers.location}") center center / cover`,
              isImgExist: true
            })
          }
          img.onerror = () => {
            console.warn(`avatar not exists. jid:${this.props.jid}`);
          }
          return;
        }
        this.setState({
          avatar: `url("${res.headers.location}") center center / cover`,
          isImgExist: true
        })
      })
    }
  }
  render() {
    const { name, size = 48 } = this.props;
    const { avatar, isImgExist } = this.state;
    return (
      <div
        style={{
          height: size,
          width: size,
          minWidth: size,
          minHeight: size,
          fontSize: size / 2 - 1,
          borderRadius: size / 2,
          background: avatar,
          backgroundSize: 'cover',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {isImgExist ? null : getInitials(name).toUpperCase()}
      </div>
    )
  }
}

ContactAvatar.propTypes = {
  jid: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  email: PropTypes.string,//.isRequired,
  avatar: PropTypes.string,
  size: PropTypes.number,
};

ContactAvatar.defaultProps = {
  size: 48,
};

export default ContactAvatar;
