let exports;
const storage = require('electron-localstorage');

if (process.env.NODE_ENV === 'production') {
  exports = require('./configureStore.prod'); // eslint-disable-line global-require
} else {
  exports = require('./configureStore.dev'); // eslint-disable-line global-require
}

const EdisonMailStorageKey = 'EdisonMail-Storage';

exports.loadFromLocalStorage = () => {
  if (window.chatLocalStorage) {
    return;
  }
  const storageString = storage.getItem(EdisonMailStorageKey) || '{"nicknames":{}}';
  window.chatLocalStorage  = JSON.parse(storageString);
};

exports.saveToLocalStorage = () => {
  const storageString = JSON.stringify(chatLocalStorage);
  storage.setItem(EdisonMailStorageKey, storageString);
};

module.exports = exports;
