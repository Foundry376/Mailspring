/* eslint import/no-dynamic-require:0 */
/**
 * NOTE: Due to path issues, this script must be run outside of grunt
 * directly from a powershell command.
 */
const path = require('path');
const { createWindowsInstaller } = require('electron-winstaller');

const appDir = path.join(__dirname, '..');
const { version } = require(path.join(appDir, 'package.json'));

const config = {
  usePackageJson: false,
  outputDirectory: path.join(appDir, 'dist'),
  appDirectory: path.join(appDir, 'dist', 'Edison Mail-win32-x64'),
  loadingGif: path.join(appDir, 'build', 'resources', 'win', 'edo-previewer-loading.gif'),
  iconUrl: 'https://cp.edison.tech/static/edisonmail.ico',
  certificateFile: process.env.WINDOWS_CODESIGN_CERT,
  description: 'Edison Mail',
  version: version,
  title: 'Edison Mail',
  authors: 'Foundry 376, LLC',
  setupIcon: path.join(appDir, 'build', 'resources', 'win', 'edisonmail.ico'),
  setupExe: 'EdisonMailSetup.exe',
  exe: 'Edison Mail.exe',
  name: 'EdisonMail',
};

console.log(config);
console.log('---> Starting');

// avoid logging the certificate password
config.certificatePassword = process.env.WINDOWS_CODESIGN_CERT_PASSWORD;

createWindowsInstaller(config)
  .then(() => {
    console.log('createWindowsInstaller succeeded.');
    process.exit(0);
  }, e => {
    console.log(`createWindowsInstaller failed: ${e.message}`);
    process.exit(1);
  })
  .catch(e => {
    console.error(`createWindowsInstaller failed: ${e.message}`);
    process.exit(1);
  });
