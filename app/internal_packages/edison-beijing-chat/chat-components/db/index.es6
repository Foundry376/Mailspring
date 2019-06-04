import * as RxDB from 'rxdb';
import adapter from 'pouchdb-adapter-node-websql';
import schemas from './schemas';
import path from "path";
import fs from 'fs';
const Sequelize = require('sequelize');

RxDB.plugin(adapter);

let dbPromise;
let sequelize;

function databasePath(specMode) {
  let configDirPath = AppEnv.getConfigDirPath();
  let dbpath = path.join(configDirPath, 'chat-db');
  if (!fs.existsSync(dbpath)) {
    fs.mkdirSync(dbpath);
  }
  let dbPath = path.join(dbpath, 'mailspring-chat.db');
  if (specMode) {
    dbPath = path.join(dbpath, 'mailspring-chat.test.db');
  }
  return dbPath;
}

const createDb = async () => {
  let specMode = AppEnv.inSpecMode();
  let dbPath = databasePath(specMode);
  const db = await RxDB.create({
    name: dbPath,
    adapter: 'websql',
    pouchSettings: {
      auto_compaction: true,
    }
  });
  await Promise.all(
    Object.entries(schemas)
      .map(([name, schema]) => db.collection({ name, schema }))
  );
  window.rxdb = db;
  return db;
};

const createSQLITE = () => {
  if (sequelize) {
    return sequelize;
  }
  let configDirPath = AppEnv.getConfigDirPath();
  let dbPath = path.join(configDirPath, 'chat-db');
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
  }
  console.log('****storage', `${dbPath}/chat-db.sqlite`);
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
  if (!dbPromise) {
    dbPromise = createDb();
  }
  if (!sequelize) {
    sequelize = createSQLITE();
  }
  return dbPromise;
};
