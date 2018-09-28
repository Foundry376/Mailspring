import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const SendIcon = ({ color, ...props }) => (
  <SvgIcon {...props}>
    <polyline
      points="13 17 18 12 13 7"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <polyline
      points="6 17 11 12 6 7"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
  </SvgIcon>
);

SendIcon.propTypes = {
  color: PropTypes.string,
};

SendIcon.defaultProps = {
  color: '#000',
};

export default SendIcon;
