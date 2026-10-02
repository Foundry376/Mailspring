/* eslint import/no-dynamic-require:0 */
/**
 * Squirrel generates Update.exe, squirrel.exe and mailspring_ExecutionStub.exe
 * while building the installer, after the workflow signs the app directory and
 * before it signs the installer. Unsigned, the stub -- which Squirrel installs
 * as %LocalAppData%\Mailspring\mailspring.exe -- trips Smart App Control, so
 * pass --signWithParams and let Squirrel sign them itself.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createWindowsInstaller } = require('electron-winstaller');

const appDir = path.join(__dirname, '..');
const { version } = require(path.join(appDir, 'package.json'));

const signToolPath = process.env.WINDOWS_SIGNTOOL_PATH;
const signWithParams = process.env.WINDOWS_SIGN_PARAMS;

// Squirrel runs signtool.exe from whichever vendor directory it was launched
// from, and the copy electron-winstaller bundles is the 2009 Windows 7 build.
// Trusted Signing needs one from Windows SDK 10.0.22621.755 or newer, so the
// workflow finds it on the runner and passes it in. Its sibling DLLs come too,
// because signtool loads several of them from its own directory.
function createVendorDirectory() {
  const bundled = path.join(
    path.dirname(require.resolve('electron-winstaller/package.json')),
    'vendor'
  );

  const vendorDirectory = path.join(os.tmpdir(), 'mailspring-winstaller-vendor');
  fs.rmSync(vendorDirectory, { recursive: true, force: true });
  fs.cpSync(bundled, vendorDirectory, { recursive: true });

  const signToolDirectory = path.dirname(signToolPath);
  for (const entry of fs.readdirSync(signToolDirectory, { withFileTypes: true })) {
    if (entry.isFile() && /\.dll$/i.test(entry.name)) {
      fs.copyFileSync(
        path.join(signToolDirectory, entry.name),
        path.join(vendorDirectory, entry.name)
      );
    }
  }
  fs.copyFileSync(signToolPath, path.join(vendorDirectory, 'signtool.exe'));

  return vendorDirectory;
}

/**
 * Squirrel logs signtool's output when signing succeeds and discards it when it
 * fails, reporting only the command it ran. Sign a throwaway binary first so a
 * broken signing setup fails here, with the reason, rather than fifty lines
 * deep in a Squirrel stack trace.
 */
function verifySigningWorks(vendorDirectory) {
  const subject = path.join(vendorDirectory, 'signtool-smoke-test.exe');
  fs.copyFileSync(path.join(vendorDirectory, 'StubExecutable.exe'), subject);

  const signTool = path.join(vendorDirectory, 'signtool.exe');
  const result = spawnSync(`"${signTool}" sign ${signWithParams} "${subject}"`, {
    shell: true,
    encoding: 'utf8',
  });
  try {
    fs.rmSync(subject, { force: true });
  } catch (e) {
    // Signtool can still hold the file briefly; leaving it behind is harmless.
  }

  if (result.status !== 0) {
    console.error('---> signtool could not sign a test binary, so Squirrel cannot either');
    console.error(`exit code: ${result.status}`);
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    process.exit(1);
  }

  console.log('---> signtool signed a test binary successfully');
}

const config = {
  usePackageJson: false,
  outputDirectory: path.join(appDir, 'dist'),
  appDirectory: path.join(appDir, 'dist', 'mailspring-win32-x64'),
  loadingGif: path.join(appDir, 'build', 'resources', 'win', 'loading.gif'),
  iconUrl: 'http://mailspring-builds.s3.amazonaws.com/assets/mailspring-square.ico',
  description: 'Mailspring',
  version: version,
  title: 'Mailspring',
  authors: 'Foundry 376, LLC',
  setupIcon: path.join(appDir, 'build', 'resources', 'win', 'mailspring-square.ico'),
  setupExe: 'MailspringSetup.exe',
  exe: 'mailspring.exe',
  name: 'Mailspring',
};

if (signWithParams) {
  if (!signToolPath) {
    console.error('WINDOWS_SIGN_PARAMS is set without WINDOWS_SIGNTOOL_PATH');
    process.exit(1);
  }
  config.vendorDirectory = createVendorDirectory();
  config.signWithParams = signWithParams;
  verifySigningWorks(config.vendorDirectory);
} else {
  console.log('---> WINDOWS_SIGN_PARAMS is unset, building an unsigned installer');
}

console.log(config);
console.log('---> Starting');

createWindowsInstaller(config)
  .then(() => {
    console.log('createWindowsInstaller succeeded.');
    process.exit(0);
  })
  .catch((e) => {
    console.error(`createWindowsInstaller failed: ${e.message}`);
    process.exit(1);
  });
