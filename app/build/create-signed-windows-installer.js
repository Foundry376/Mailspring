/* eslint import/no-dynamic-require:0 */
/**
 * NOTE: Due to path issues, this script must be run outside of grunt
 * directly from a powershell command.
 *
 * Code signing is handled separately by Azure Trusted Signing action in the
 * GitHub workflow. This script creates an unsigned installer which is then
 * signed by the workflow after creation.
 */
const path = require('path');
const { createWindowsInstaller } = require('electron-winstaller');

const appDir = path.join(__dirname, '..');
const { version } = require(path.join(appDir, 'package.json'));

const config = {
  usePackageJson: false,
  outputDirectory: path.join(appDir, 'dist'),
  appDirectory: path.join(appDir, 'dist', 'mailspring-win32-x64'),
  loadingGif: path.join(appDir, 'build', 'resources', 'win', 'loading.gif'),
  iconUrl: 'http://mailspring-builds.s3.amazonaws.com/assets/mailspring.ico',
  description: 'Mailspring',
  version: version,
  title: 'Mailspring',
  authors: 'Foundry 376, LLC',
  setupIcon: path.join(appDir, 'build', 'resources', 'win', 'mailspring.ico'),
  setupExe: 'MailspringSetup.exe',
  exe: 'mailspring.exe',
  name: 'Mailspring',
};

console.log(config);
console.log('---> Starting');

createWindowsInstaller(config)
  .then(() => {
    console.log('createWindowsInstaller succeeded.');
    process.exit(0);
  })
  .catch(e => {
    console.error(`createWindowsInstaller failed: ${e.message}`);
    process.exit(1);
  });
