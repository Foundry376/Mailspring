import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const CancelIcon = ({ color = '#000', ...props }) => (
  <SvgIcon {...props}>
    <line
      x1="18"
      y1="6"
      x2="6"
      y2="18"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <line
      x1="6"
      y1="6"
      x2="18"
      y2="18"
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

CancelIcon.propTypes = {
  color: PropTypes.string,
};

CancelIcon.defaultProps = {
  color: '#000',
};

export default CancelIcon;
