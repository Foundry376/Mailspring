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
  appDirectory: path.join(appDir, 'dist', 'Edison Mail-win32-ia32'),
  loadingGif: path.join(appDir, 'build', 'resources', 'win', 'loading.gif'),
  iconUrl: 'http://mailspring-builds.s3.amazonaws.com/assets/mailspring.ico',
  certificateFile: process.env.WINDOWS_CODESIGN_CERT,
  description: 'EdisonMail',
  version: version,
  title: 'EdisonMail',
  authors: 'Foundry 376, LLC',
  setupIcon: path.join(appDir, 'build', 'resources', 'win', 'edisonmail.ico'),
  setupExe: 'EdisonMailSetup.exe',
  exe: 'Edison Mail.exe',
  name: 'Edison Mail',
};

console.log(config);
console.log('---> Starting');

// avoid logging the certificate password
config.certificatePassword = process.env.WINDOWS_CODESIGN_CERT_PASSWORD;

createWindowsInstaller(config)
  .then(() => {
    console.log('createWindowsInstaller succeeded.');
    process.exit(0);
  })
  .catch(e => {
    console.error(`createWindowsInstaller failed: ${e.message}`);
    process.exit(1);
  });
