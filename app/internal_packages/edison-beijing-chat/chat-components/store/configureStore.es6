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
  const chatStorage = JSON.parse(storageString);
  window.chatLocalStorage = chatStorage;
};

exports.saveToLocalStorage = () => {
  const chatStorage = chatLocalStorage;
  const storageString = JSON.stringify(chatStorage);
  storage.setItem(EdisonMailStorageKey, storageString);
};

module.exports = exports;
