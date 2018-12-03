import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { gradientColorForString } from '../../utils/colors';

const getInitials = name => {
  const trimmedName = name.trim();
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
  }
  render() {
    const { name, jid, size = 48, avatar } = this.props;
    return (
      <div
        style={{
          height: size,
          width: size,
          minWidth: size,
          minHeight: size,
          fontSize: size / 2 - 1,
          borderRadius: size / 2,
          background: avatar ? `url(https://s3.us-east-2.amazonaws.com/edison-profile-stag/${avatar})` : gradientColorForString(jid),
          backgroundSize: 'cover',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {avatar ? null : getInitials(name).toUpperCase()}
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
