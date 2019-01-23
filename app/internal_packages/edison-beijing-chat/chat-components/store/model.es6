const chatModel = {
  allSelfUsers: {},
  currentUser: {},
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

export default chatModel;
