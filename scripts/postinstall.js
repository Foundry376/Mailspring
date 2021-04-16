#!/usr/bin/env node
/* eslint global-require: 0 */
/* eslint quote-props: 0 */
const path = require('path');
const https = require('https');
const fs = require('fs');
const rimraf = require('rimraf');
const targz = require('targz');
const { safeExec } = require('./utils/child-process-wrapper.js');

const appDependencies = require('../app/package.json').dependencies;
const rootDependencies = require('../package.json').dependencies;
const npmElectronTarget = rootDependencies.electron;
const npmEnvs = {
  system: process.env,
  electron: Object.assign({}, process.env, {
    npm_config_target: npmElectronTarget,
    npm_config_arch: process.arch,
    npm_config_target_arch: process.arch,
    npm_config_disturl: 'https://atom.io/download/electron',
    npm_config_runtime: 'electron',
    npm_config_build_from_source: true,
  }),
};

function npm(cmd, options) {
  const { cwd, env } = Object.assign({ cwd: '.', env: 'system' }, options);

  return new Promise((resolve, reject) => {
    console.log(`\n-- Running npm ${cmd} in ${cwd} with ${env} config --`);

    safeExec(
      `npm ${cmd}`,
      {
        cwd: path.resolve(__dirname, '..', cwd),
        env: npmEnvs[env],
      },
      err => {
        return err ? reject(err) : resolve(null);
      }
    );
  });
}

function downloadMailsync() {
  https.get(`https://mailspring-builds.s3.amazonaws.com/stable.txt`, response => {
    let data = '';
    response.on('data', d => {
      data += d;
    });
    response.on('end', () => {
      const head = data.split('-').pop();
      const distKey = `${process.platform}-${process.arch}`;
      const distDir = {
        'darwin-x64': 'osx',
        'win32-x64': 'win-ia32', // serve 32-bit since backwards compatibility is great
        'win32-ia32': 'win-ia32',
        'linux-x64': 'linux',
        'linux-ia32': null,
      }[distKey];

      if (!distDir) {
        console.error(
          `\nSorry, a Mailspring Mailsync build for your machine (${distKey}) is not yet available.`
        );
        return;
      }

      const distS3URL = `https://mailspring-builds.s3.amazonaws.com/client/${head}/${distDir}/mailsync.tar.gz`;
      https.get(distS3URL, response => {
        if (response.statusCode === 200) {
          response.pipe(fs.createWriteStream(`app/mailsync.tar.gz`));
          response.on('end', () => {
            console.log(`\nDownloaded Mailsync build ${distDir}-${head} to ./app/mailsync.tar.gz.`);
            targz.decompress(
              {
                src: `app/mailsync.tar.gz`,
                dest: 'app/',
              },
              err => {
                if (!err) {
                  console.log(`\nUnpackaged Mailsync build.`);
                } else {
                  console.error(`\nEncountered an error unpacking: ${err}`);
                }
              }
            );
          });
        } else {
          console.error(
            `Sorry, an error occurred while fetching the Mailspring Mailsync build for your machine\n(${distS3URL})\n`
          );
          response.pipe(process.stderr);
          response.on('end', () => console.error('\n'));
        }
      });
    });
  });
}

// For speed, we cache app/node_modules. However, we need to
// be sure to do a full rebuild of native node modules when the
// Electron version changes. To do this we check a marker file.
const appPath = path.resolve(__dirname, '..', 'app');
const appModulesPath = path.resolve(appPath, 'node_modules');
const cacheVersionPath = path.join(appModulesPath, '.postinstall-target-version');
const cacheElectronTarget =
  fs.existsSync(cacheVersionPath) && fs.readFileSync(cacheVersionPath).toString();

if (cacheElectronTarget !== npmElectronTarget) {
  console.log(
    `\n-- Clearing app/node_modules (${cacheElectronTarget} !== ${npmElectronTarget}) --`
  );
  rimraf.sync(appModulesPath);
}

// Audit is emitted with npm ls, no need to run it on EVERY command which is an odd default

async function sqliteMissingUsleep() {
  return new Promise(resolve => {
    const sqliteLibDir = path.join(appModulesPath, 'better-sqlite3', 'build', 'Release');
    safeExec(
      `nm '${sqliteLibDir}/sqlite3.a' | grep usleep`,
      { ignoreStderr: true },
      (err, resp) => {
        resolve(resp === '');
      }
    );
  });
}

async function run() {
  // run `npm install` in ./app with Electron NPM config
  await npm(`install --no-audit`, { cwd: './app', env: 'electron' });

  // run `npm dedupe` in ./app with Electron NPM config
  await npm(`dedupe --no-audit`, { cwd: './app', env: 'electron' });

  // run `npm ls` in ./app - detects missing peer dependencies, etc.
  await npm(`ls`, { cwd: './app', env: 'electron' });

  // rebuild sqlite3 using our custom amalgamation, which has USLEEP enabled
  if (process.platform === 'win32' || (await sqliteMissingUsleep())) {
    // remove the existing build so NPM can't see that it's already present
    rimraf.sync(path.join(appModulesPath, 'better-sqlite3'));
    // install the module pointing to our local sqlite source with custom #DEFINEs set
    const amalgamationPath = path.join(appPath, 'build', 'sqlite-amalgamation');
    await npm(
      `install better-sqlite3@${appDependencies['better-sqlite3']} ` +
        `--no-save --no-audit --build-from-source --sqlite3="${amalgamationPath}"`,
      { cwd: './app', env: 'electron' }
    );
    // remove the build symlinks so that we can build an installer for the app without
    // symlinks out to the sqlite-amalgamation directory.
    rimraf.sync(path.join(appModulesPath, 'better-sqlite3', 'build', 'Release', 'obj'));
  }

  // if SQlite was STILL not built with HAVE_USLEEP, do not ship this build! We need usleep
  // support so that multiple processes can connect to the sqlite file at the same time.
  // Without it, transactions only retry every 1 sec instead of every 10ms, leading to
  // awful db lock contention.
  if (['linux', 'darwin'].includes(process.platform) && (await sqliteMissingUsleep())) {
    console.error(`better-sqlite compiled without -HAVE_USLEEP, do not ship this build!`);
    process.exit(1001);
  }

  // write the marker with the electron version
  fs.writeFileSync(cacheVersionPath, npmElectronTarget);

  // if the user hasn't cloned the private mailsync module, download
  // the binary for their operating system that was shipped to S3.
  if (!fs.existsSync('./mailsync/build.sh')) {
    console.log(`\n-- Downloading the last released version of Mailspring mailsync --`);
    downloadMailsync();
  }
}

run();
