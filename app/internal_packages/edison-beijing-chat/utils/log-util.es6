const fs = require('fs');

import path from "path";

export const logger = {};

let fd;

export const init = () => {
  const configDirPath = AppEnv.getConfigDirPath();
  const logFile = path.join(configDirPath, 'chat.log');
  const time = new Date();
  fd = fs.openSync(logFile, 'a');
  fs.writeSync(fd, `>>> ${Math.floor(time/1000)} : ${time.toLocaleString()}: edisonmail start running -------\n`);
};

export const quit = () => {
  const time = new Date();
  fs.writeSync(fd, `>>> ${Math.floor(time/1000)} : ${time.toLocaleString()}: edisonmail quit running -------\n`);
  fs.closeSync(fd);
  return;
};

export const log = msg => {
  const time = new Date();
  fs.writeSync(fd, `>>> ${Math.floor(time/1000)} : ${time.toLocaleString()}:  ${msg}\n`);
};

export default {
  init,
  quit,
  log
}
