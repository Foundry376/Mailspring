import path from "path";
import fs from 'fs';
const Sequelize = require('sequelize');

let sequelize;

const createSQLITE = () => {
  if (sequelize) {
    return sequelize;
  }
  let configDirPath = AppEnv.getConfigDirPath();
  let dbPath = path.join(configDirPath, 'chat-db');
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
  }
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: `${dbPath}/chat-db.sqlite`
  });
  return sequelize;
}

export const getSequelize = () => {
  return createSQLITE();
}

export default () => {
  return createSQLITE();
};
