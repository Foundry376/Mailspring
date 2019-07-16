import React from 'react';
import PropTypes from 'prop-types';

const Button = ({ children, className = "", ...props }) => (
  <div className={"button " + className} {...props}>
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
