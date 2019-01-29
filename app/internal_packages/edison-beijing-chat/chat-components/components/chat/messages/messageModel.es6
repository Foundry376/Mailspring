const FILE_TYPE = {
  TEXT: 1,
  IMAGE: 2,
  GIF: 5,
  STICKER: 12,
  OTHER_FILE: 9
}

/*
  the data object to share data between Messages and MessageImagePopup
  the code is simpler not to use redux.
 */
export default module.exports = {
  messagesReactInstance: null,  // this pointer in message.jsx set in Messages.render function
  imagePopup: null, // this pointer in MessageImagePopup.jsx set in MessageImagePopup.constructor function
  currentUserId: null, // Messages.props.currentUserId
  group: null, // current group that contains current msg taht contains current image
  msg: null, // current msg contains current image
  msgBody: null, // msgBody contains current image
  FILE_TYPE
}