import React from 'react';
import PropTypes from 'prop-types';

const divider = { backgroundColor: '#DCDCDC' };

const horizontal = {
  ...divider,
  height: '1px',
  minHeight: '1px',
};

const vertical = {
  ...divider,
  width: '1px',
  minWidth: '1px',
};

const Divider = ({ type }) => (
  <div className="divider" style={type === 'horizontal' ? horizontal : vertical} />
);

Divider.propTypes = {
  type: PropTypes.oneOf(['horizontal', 'vertical']).isRequired
};

export default Divider;
