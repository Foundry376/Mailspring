import * as RxDB from 'rxdb';
import adapter from 'pouchdb-adapter-node-websql';
import schemas from './schemas';
import path from "path";

RxDB.plugin(adapter);

let dbPromise = null;

function databasePath(configDirPath, specMode = false) {
  let dbPath = path.join(configDirPath, 'mailspring-messaging.db');
  if (specMode) {
    dbPath = path.join(configDirPath, 'mailspring-messaging.test.db');
  }
  return dbPath;
}

const createDb = async () => {
  let dbPath = databasePath(AppEnv.getConfigDirPath(), AppEnv.inSpecMode())
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
  debugger;
  window.rxdb = db;
  return db;
};

export default () => {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
};
