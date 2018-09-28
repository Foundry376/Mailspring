import React from 'react';
import PropTypes from 'prop-types';

const Button = ({ children, ...props }) => (
  <div className="button" {...props}>
    {children}
  </div>
);

Button.propTypes = {
  children: PropTypes.node,
};

Button.defaultProps = {
  children: null,
};

export default Button;
