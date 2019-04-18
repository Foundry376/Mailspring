import * as RxDB from 'rxdb';
import adapter from 'pouchdb-adapter-node-websql';
import schemas from './schemas';
import path from "path";
import fs from 'fs';

RxDB.plugin(adapter);

let dbPromise;

function databasePath(specMode) {
  let configDirPath = AppEnv.getConfigDirPath();
  let dbpath = path.join(configDirPath, 'chat-db');
  if (!fs.existsSync(dbpath)) {
    fs.mkdirSync(dbpath);
  }
  let logoPath = path.join(configDirPath, 'logo_cache');
  if (!fs.existsSync(logoPath)) {
    fs.mkdirSync(logoPath);
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
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
};
