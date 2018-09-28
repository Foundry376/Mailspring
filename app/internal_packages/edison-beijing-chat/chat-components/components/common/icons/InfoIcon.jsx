import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const InfoIcon = ({ active = false, color = '#000', ...props }) => (
  <SvgIcon {...props}>
    <circle
      cx="12"
      cy="12"
      r="10"
      style={{
        fill: active ? color : 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <line
      x1="12"
      y1="16"
      x2="12"
      y2="12"
      style={{
        fill: 'none',
        stroke: active ? 'white' : color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <line
      x1="12"
      y1="8"
      x2="12"
      y2="8"
      style={{
        fill: 'none',
        stroke: active ? 'white' : color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
  </SvgIcon>
);

InfoIcon.propTypes = {
  active: PropTypes.bool,
  color: PropTypes.string,
};

InfoIcon.defaultProps = {
  active: false,
  color: '#000',
};

export default InfoIcon;
