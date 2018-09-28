import React from 'react';
import PropTypes from 'prop-types';

const SvgIcon = ({ children, size, viewBox, ...props }) => (
  <svg height={size} width={size} viewBox={viewBox} {...props}>
    {children}
  </svg>
);

SvgIcon.propTypes = {
  children: PropTypes.node,
  size: PropTypes.number,
  viewBox: PropTypes.string,
};

SvgIcon.defaultProps = {
  children: null,
  size: 24,
  viewBox: '0 0 24 24',
};

export default SvgIcon;
