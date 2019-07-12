const LOG = require('electron-log');

export const log = (kind, msg) => {
  const filename = LOG.transports.file.fileName;
  LOG.transports.file.fileName = `chat-${kind}.log`;
  AppEnv.logInfo(msg);
  LOG.transports.file.fileName = filename;
}
