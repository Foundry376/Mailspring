const Sqlite3 = require('better-sqlite3');
const dbs = {};

const deathDelay = 5000;
let deathTimer = setTimeout(() => process.exit(0), deathDelay);

const getDatabase = (dbpath) => {
  if (dbs[dbpath]) {
    return dbs[dbpath];
  }

  // let openResolve = null;

  try {
    dbs[dbpath] = new Sqlite3(dbpath, { readonly: true });
  } catch (err) {
    AppEnv.reportError(err);
    process.exit(1);
  }
  // dbs[dbpath].on('close', (err) => {
  //   console.error(err);
  //   process.exit(1);
  // });
  // dbs[dbpath].on('open', () => {
  //   openResolve(dbs[dbpath]);
  // });

  // dbs[dbpath].openPromise = new Promise((resolve) => {
  //   openResolve = resolve;
  // });

  return dbs[dbpath];
}

process.on('message', (m) => {
  clearTimeout(deathTimer);
  const { query, values, id, dbpath } = m;
  const start = Date.now();

  const db = getDatabase(dbpath);
  clearTimeout(deathTimer);
  const fn = query.startsWith('SELECT') ? 'all' : 'run';
  const stmt = db.prepare(query);
  const results = stmt[fn](values);
  process.send({ type: 'results', results, id, agentTime: Date.now() - start });

  clearTimeout(deathTimer);
  deathTimer = setTimeout(() => process.exit(0), deathDelay);

  // getDatabase(dbpath).then((db) => {
  //   clearTimeout(deathTimer);
  //   const fn = query.startsWith('SELECT') ? 'all' : 'run';
  //   const stmt = db.prepare(query);
  //   const results = stmt[fn](values);
  //   process.send({ type: 'results', results, id, agentTime: Date.now() - start });

  //   clearTimeout(deathTimer);
  //   deathTimer = setTimeout(() => process.exit(0), deathDelay);
  // });
});
