import React from 'react';
import PropTypes from 'prop-types';
import SvgIcon from '../SvgIcon';

const CheckIcon = ({ color = '#000', ...props }) => (
  <SvgIcon {...props}>
    <polyline
      points="20 6 9 17 4 12"
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

CheckIcon.propTypes = {
  color: PropTypes.string,
};

CheckIcon.defaultProps = {
  color: '#000',
};

export default CheckIcon;
