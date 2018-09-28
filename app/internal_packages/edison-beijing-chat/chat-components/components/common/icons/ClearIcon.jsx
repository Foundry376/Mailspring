import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const ClearIcon = ({ color = '#000', ...props }) => (
  <SvgIcon {...props}>
    <circle
      cx="12"
      cy="12"
      r="10"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <line
      x1="15"
      y1="9"
      x2="9"
      y2="15"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <line
      x1="9"
      y1="9"
      x2="15"
      y2="15"
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

ClearIcon.propTypes = {
  color: PropTypes.string,
};

ClearIcon.defaultProps = {
  color: '#000',
};

export default ClearIcon;
