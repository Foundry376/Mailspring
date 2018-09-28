import * as RxDB from 'rxdb';
import adapter from 'pouchdb-adapter-websql';
import schemas from './schemas';

RxDB.plugin(adapter);

let dbPromise = null;

const createDb = async () => {
  const db = await RxDB.create({
    name: 'messagingdb',
    adapter: 'websql'
  });
  await Promise.all(
    Object.entries(schemas)
      .map(([name, schema]) => db.collection({ name, schema }))
  );
  return db;
};

export default () => {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
};
