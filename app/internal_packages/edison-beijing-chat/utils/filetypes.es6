const FILE_TYPE = {
  TEXT: 1,
  IMAGE: 2,
  GIF: 5,
  STICKER: 12,
  OTHER_FILE: 9,
};

const MESSAGE_TYPE = {
  CHAT: 'chat',
  GROUP: 'groupchat',
};

const isImage = type => {
  return type === FILE_TYPE.IMAGE || type === FILE_TYPE.GIF || type === FILE_TYPE.STICKER;
};

export default module.exports = {
  FILE_TYPE,
  MESSAGE_TYPE,
  isImage,
};