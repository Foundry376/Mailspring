import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const ComposeIcon = ({ color = '#000', ...props }) => (
  <SvgIcon {...props}>
    <path
      d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"
      style={{
        fill: 'none',
        stroke: color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
      }}
    />
    <polygon
      points="18 2 22 6 12 16 8 16 8 12 18 2"
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

ComposeIcon.propTypes = {
  color: PropTypes.string,
};

ComposeIcon.defaultProps = {
  color: '#000',
};

export default ComposeIcon;
