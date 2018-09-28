import React from 'react';
import PropTypes from 'prop-types';
import { colorForString } from '../../utils/colors';

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

const ContactAvatar = ({ name, jid, size = 48 }) => (
  <div
    style={{
      height: size,
      width: size,
      minWidth: size,
      minHeight: size,
      fontSize: size / 2,
      borderRadius: size / 2,
      background: colorForString(jid),
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      flexShrink: 0,
    }}
  >
    {getInitials(name).toUpperCase()}
  </div>
);

ContactAvatar.propTypes = {
  jid: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.number,
};

ContactAvatar.defaultProps = {
  size: 48,
};

export default ContactAvatar;
