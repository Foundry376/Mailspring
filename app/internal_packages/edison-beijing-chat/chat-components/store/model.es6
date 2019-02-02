const EdisonMailStorageKey = 'EdisonMail-Storage';
const storage = require('electron-localstorage');
const chatModel = {
  diffTime: 0, //the diffTime to correct sentTime from xmpp server, see xmpp/index.es6 on 'session:prebind'
  allSelfUsers: {},
  currentUser: {},
  chatStorage: null, // {"nicknames":{}} // data in window.localStorage for chat
  store: null, // will save the store instance in ConfigureStore
  editingMessageId: null, //inplace editing message's id
  groupAvatars: [], // GroupChatAvatar React instance
  updateAvatars(conversationJid) {
    this.groupAvatars.forEach(groupAvatar => {
      if (groupAvatar && conversationJid === groupAvatar.props.conversation.jid) {
        groupAvatar.refreshAvatar(groupAvatar.props);
      }
    })
  }
};

export const loadFromLocalStorage = () => {
  if (chatModel.chatStorage) {
    return;
  }
  const storageString = storage.getItem(EdisonMailStorageKey) || '{"nicknames":{}}';
  const chatStorage = JSON.parse(storageString);
  chatModel.chatStorage = chatStorage;
};

export const saveToLocalStorage = () => {
  const chatStorage = chatModel.chatStorage;
  const storageString = JSON.stringify(chatStorage);
  storage.setItem(EdisonMailStorageKey, storageString);
};

export default chatModel;
