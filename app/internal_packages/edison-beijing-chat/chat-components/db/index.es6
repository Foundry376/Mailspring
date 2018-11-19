import * as RxDB from 'rxdb';
import adapter from 'pouchdb-adapter-node-websql';
import schemas from './schemas';
import path from "path";
import fs from 'fs';

RxDB.plugin(adapter);

let dbPromiseMap = {};

function databasePath(userId, specMode) {
  let configDirPath = AppEnv.getConfigDirPath();
  let dbpath = path.join(configDirPath, 'chat-db');
  if (!fs.existsSync(dbpath)) {
    fs.mkdirSync(dbpath);
  }
  let activeChatAccount = AppEnv.config.get('activeChatAccount');
  dbpath = path.join(dbpath, userId);
  if (!fs.existsSync(dbpath)) {
    fs.mkdirSync(dbpath);
  }
  let dbPath = path.join(dbpath, 'mailspring-chat.db');
  if (specMode) {
    dbPath = path.join(dbpath, 'mailspring-chat.test.db');
  }
  return dbPath;
}

const createDb = async (userId) => {
  let specMode = AppEnv.inSpecMode();
  let dbPath = databasePath(userId, specMode);
  const db = await RxDB.create({name: dbPath,
    adapter: 'websql',
    // pouchSettings: {
    //   name: dbPath,
    //   adapter: 'websql'
    // }
  });
  await Promise.all(
    Object.entries(schemas)
      .map(([name, schema]) => db.collection({ name, schema }))
  );
  window.rxdb = db;
  return db;
};

export default () => {
  let activeChatAccount = AppEnv.config.get('activeChatAccount');
  let userId = activeChatAccount.userId;
  let dbPromise = dbPromiseMap[userId];
  if (!dbPromise) {
    dbPromise = createDb(userId);
    dbPromiseMap[userId] = dbPromise;
  }
  return dbPromise;
};
