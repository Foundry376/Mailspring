const fs = require('fs');

import path from "path";

export const logger = {};

let fd, fd2;

export const init = () => {
  // const configDirPath = AppEnv.getConfigDirPath();
  // const logFile = path.join(configDirPath, 'chat.log');
  // const logFile2 = path.join(configDirPath, 'chat2.log');
  // const time = new Date();
  // fd = fs.openSync(logFile, 'a');
  // fd2 = fs.openSync(logFile2, 'a');
  // fs.writeSync(fd, `>>> ${Math.floor(time / 1000)} : ${time.toLocaleString()}: edisonmail start running -------\n`);
};

export const quit = () => {
  // const time = new Date();
  // fs.writeSync(fd, `>>> ${Math.floor(time / 1000)} : ${time.toLocaleString()}: edisonmail quit running -------\n`);
  // fs.closeSync(fd);
  // fs.closeSync(fd2);
  return;
};

export const log = msg => {
  // const time = new Date();
  // fs.writeSync(fd, `>>> ${Math.floor(time/1000)} : ${time.toLocaleString()}:  ${msg}\n`);
};

export const log2 = (msg) => {
  // const time = new Date();
  // fs.writeSync(fd2, `>>> ${Math.floor(time/1000)} : ${time.toLocaleString()}:  ${msg}\n`);
};

export default {
  init,
  quit,
  log,
  log2
}
