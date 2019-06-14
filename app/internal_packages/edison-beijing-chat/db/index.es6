import path from "path";
import fs from 'fs';
const Sequelize = require('sequelize');

let db;

export function getdb() {
  if (db) {
    return db;
  }
  let configDirPath = AppEnv.getConfigDirPath();
  let dbPath = path.join(configDirPath, 'chat-db');
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
  }
  console.log('****storage', `${dbPath}/chat-db.sqlite`);
  db = new Sequelize({
    dialect: 'sqlite',
    storage: `${dbPath}/chat-db.sqlite`
  });
  return db;
}

export default getdb;
