const EdisonMailStorageKey = 'EdisonMail-Storage';
const storage = require('electron-localstorage');
const chatModel = {
  diffTime: 0, //the diffTime to correct sentTime from xmpp server, see xmpp/index.es6 on 'session:prebind'
  lastUpdateConversationTime: 0,
  lastUpdateMessageTime: 0,
  allSelfUsers: {},
  chatStorage: null, // {"nicknames":{}} // data in window.localStorage for chat
  store: null, // will save the store instance in ConfigureStore
  editingMessageId: null, //inplace editing message's id
  groupAvatars: [], // GroupChatAvatar React instance
  loadProgressMap: {}, // record progress for downloading/uploading file, key is the msgBody.path
  updateAvatars(conversationJid) {
    this.groupAvatars.forEach(groupAvatar => {
      if (groupAvatar && conversationJid === groupAvatar.props.conversation.jid) {
        groupAvatar.refreshAvatar(groupAvatar.props);
      }
    })
  },
  progressBarData: {
    bar: null, // the react component instance for ProgressBar.jsx
    loadQueue: [],
    loadIndex: 0,
    percent: 0,
    loading: false,
    visible: false
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
