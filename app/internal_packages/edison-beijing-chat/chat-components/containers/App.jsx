import React from 'react';
import PropTypes from 'prop-types';

const App = ({ children }) => (
  <div style={{ height: '100%', width: '100%' }}>{children}</div>
);

App.propTypes = {
  children: PropTypes.node,
};

App.defaultProps = {
  children: null,
};

export default App;
