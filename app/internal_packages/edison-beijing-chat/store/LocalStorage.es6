const storage = require('electron-localstorage');

import MailspringStore from 'mailspring-store';

const EdisonMailStorageKey = 'EdisonMail-Storage';

class LocalStorage extends MailspringStore {
  constructor(){
    super();
    window.chatLocalStorage = null;
    this.loadFromLocalStorage();
    this.nicknames = chatLocalStorage.nicknames;
    return;
  }

  loadFromLocalStorage = () => {
    if (window.chatLocalStorage) {
      return;
    }
    const storageString = storage.getItem(EdisonMailStorageKey) || '{"nicknames":{}}';
    window.chatLocalStorage  = JSON.parse(storageString);
  };

  saveToLocalStorage = () => {
    const storageString = JSON.stringify(chatLocalStorage);
    storage.setItem(EdisonMailStorageKey, storageString);
  };

}

module.exports = new LocalStorage();
