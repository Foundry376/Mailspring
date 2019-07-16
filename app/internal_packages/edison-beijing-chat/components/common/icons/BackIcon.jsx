import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const BackIcon = ({ color = '#000', ...props }) => (
  <SvgIcon {...props}>
    <polyline
      points="15 18 9 12 15 6"
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

BackIcon.propTypes = {
  color: PropTypes.string,
};

BackIcon.defaultProps = {
  color: '#000',
};

export default BackIcon;
