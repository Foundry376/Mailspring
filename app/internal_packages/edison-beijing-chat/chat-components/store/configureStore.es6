let exports;

if (process.env.NODE_ENV === 'production') {
  exports = require('./configureStore.prod'); // eslint-disable-line global-require
} else {
  exports = require('./configureStore.dev'); // eslint-disable-line global-require
}

module.exports = exports;
