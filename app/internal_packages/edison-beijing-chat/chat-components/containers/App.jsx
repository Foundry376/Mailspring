import React from 'react';
import PropTypes from 'prop-types';

const App = ({ children }) => (
  <div>{children}</div>
);

App.propTypes = {
  children: PropTypes.node,
};

App.defaultProps = {
  children: null,
};

export default App;
