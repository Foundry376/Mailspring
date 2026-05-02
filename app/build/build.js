/* eslint global-require: 0 */
/* eslint import/no-dynamic-require: 0 */
/* eslint prefer-template: 0 */
/* eslint quote-props: 0 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const { execSync, spawn: childSpawn } = require('child_process');
const fsExtra = require('fs-extra');
const fsPlus = require('fs-plus');
const glob = require('glob');
const _ = require('underscore');
const TypeScript = require('typescript');
const packager = require('@electron/packager');

const platform = process.platform;
const rootDir = path.resolve(__dirname, '..', '..');
const appDir = path.resolve(rootDir, 'app');
const buildDir = path.join(appDir, 'build');
const outputDir = path.join(appDir, 'dist');
const tmpdir = path.resolve(os.tmpdir(), 'nylas-build');
const packageJSON = require(path.join(appDir, 'package.json'));
const { compilerOptions } = require(path.join(appDir, 'tsconfig.json'));

const sourceGlobs = [
  'internal_packages/**/*.ts',
  'internal_packages/**/*.tsx',
  'internal_packages/**/*.jsx',
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.jsx',
  '!src/**/node_modules/**/*.ts',
  '!src/**/node_modules/**/*.tsx',
  '!src/**/node_modules/**/*.jsx',
  '!internal_packages/**/node_modules/**/*.ts',
  '!internal_packages/**/node_modules/**/*.tsx',
  '!internal_packages/**/node_modules/**/*.jsx',
];

function spawn(options) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    const proc = childSpawn(options.cmd, options.args, options.opts);
    proc.stdout.on('data', data => stdout.push(data.toString()));
    proc.stderr.on('data', data => stderr.push(data.toString()));
    proc.on('error', reject);
    proc.on('close', exitCode => {
      const result = { stdout: stdout.join(''), stderr: stderr.join(''), code: exitCode };
      if (exitCode !== 0) {
        console.error(result.stderr);
        return reject(new Error(`${options.cmd} exited with code ${exitCode}`));
      }
      resolve(result);
    });
  });
}

const symlinkedPackages = [];

function resolveRealSymlinkPaths() {
  console.log('---> Resolving symlinks');
  const dirs = ['internal_packages', 'src', 'spec', 'node_modules'];
  dirs.forEach(dir => {
    const absoluteDir = path.join(appDir, dir);
    fs.readdirSync(absoluteDir).forEach(packageName => {
      const relativePackageDir = path.join(dir, packageName);
      const absolutePackageDir = path.join(absoluteDir, packageName);
      const realPackagePath = fs.realpathSync(absolutePackageDir).replace('/private/', '/');
      if (realPackagePath !== absolutePackageDir) {
        console.log(`  ---> Resolving '${relativePackageDir}' to '${realPackagePath}'`);
        symlinkedPackages.push({ realPackagePath, relativePackageDir });
      }
    });
  });
}

function runCopyPlatformSpecificResources(buildPath, electronVersion, plat, arch, callback) {
  const winResourcesSource = path.resolve(appDir, 'build', 'resources', 'win');
  const winResourcesTarget = path.resolve(buildPath, '..');
  if (plat === 'win32') {
    fsPlus.copySync(winResourcesSource, winResourcesTarget);
  }
  callback();
}

function runWriteCommitHashIntoPackage(buildPath, electronVersion, plat, arch, callback) {
  const commit = execSync('git rev-parse HEAD').toString();
  const jsonPath = path.resolve(buildPath, 'package.json');
  let jsonString = fs.readFileSync(jsonPath).toString();
  jsonString = jsonString.replace('COMMIT_INSERTED_DURING_PACKAGING', commit.substr(0, 8));
  fs.writeFileSync(jsonPath, jsonString);
  callback();
}

// For Electron versions that support the setuid sandbox on Linux, the
// chrome-sandbox helper executable must have the setuid (`+s` / `0o4000`) bit.
// See: https://github.com/electron/electron/pull/17269#issuecomment-470671914
function runUpdateSandboxHelperPermissions(buildPath, electronVersion, plat, arch, callback) {
  const helperPath = path.resolve(buildPath, '..', '..', 'chrome-sandbox');
  if (fs.existsSync(helperPath)) {
    console.log('---> Changing chrome-sandbox permissions');
    fs.chmodSync(helperPath, 0o4755);
  } else {
    console.log('---> Could not find chrome-sandbox to change permissions');
  }
  callback();
}

function runCopySymlinkedPackages(buildPath, electronVersion, plat, arch, callback) {
  console.log('---> Moving symlinked node modules / internal packages into build folder.');
  symlinkedPackages.forEach(({ realPackagePath, relativePackageDir }) => {
    const packagePath = path.join(buildPath, relativePackageDir);
    console.log(`  ---> Copying ${realPackagePath} to ${packagePath}`);
    fsPlus.removeSync(packagePath);
    fsPlus.copySync(realPackagePath, packagePath);
  });
  callback();
}

function writeFileEnsureDir(filePath, contents) {
  fsExtra.mkdirpSync(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

function runTranspilers(buildPath, electronVersion, plat, arch, callback) {
  console.log('---> Running TypeScript Compiler');
  sourceGlobs.forEach(pattern => {
    glob.sync(pattern, { cwd: buildPath }).forEach(relPath => {
      const tsPath = path.join(buildPath, relPath);
      const tsCode = fs.readFileSync(tsPath).toString();
      if (/(node_modules|\.js$)/.test(tsPath)) return;
      if (tsPath.endsWith('.d.ts')) return;
      const outPath = tsPath.replace(path.extname(tsPath), '.js');
      console.log(`  ---> Compiling ${tsPath.slice(tsPath.indexOf('/app') + 4)}`);
      const res = TypeScript.transpileModule(tsCode, { compilerOptions, fileName: tsPath });
      writeFileEnsureDir(outPath, res.outputText);
      if (res.sourceMapText) {
        writeFileEnsureDir(outPath + '.map', res.sourceMapText);
      }
      fs.unlinkSync(tsPath);
    });
  });
  callback();
}

async function runUploadSourceMapsToSentry(buildPath, electronVersion, plat, arch, callback) {
  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  const mapFiles = glob.sync('**/*.js.map', { cwd: buildPath });

  const cleanup = () => {
    mapFiles.forEach(relPath => fs.unlinkSync(path.join(buildPath, relPath)));
    console.log(`---> Cleaned up ${mapFiles.length} source map files`);
  };

  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
    console.log(
      '---> Skipping Sentry source map upload (set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT to enable)'
    );
    cleanup();
    callback();
    return;
  }

  let SentryCli;
  try {
    SentryCli = require('@sentry/cli');
  } catch (e) {
    console.log('---> @sentry/cli not found, skipping source map upload');
    cleanup();
    callback();
    return;
  }

  console.log('---> Uploading source maps to Sentry');

  try {
    const commitHash = execSync('git rev-parse HEAD').toString().trim().substr(0, 8);
    const version = `${packageJSON.version}-${commitHash}`;
    const cli = new SentryCli(null, {
      authToken: SENTRY_AUTH_TOKEN,
      org: SENTRY_ORG,
      project: SENTRY_PROJECT,
    });
    await cli.releases.new(version);
    await cli.releases.uploadSourceMaps(version, {
      include: [buildPath],
      urlPrefix: 'app:///',
      rewrite: true,
    });
    await cli.releases.finalize(version);
    console.log(`---> Source maps uploaded to Sentry release ${version}`);
  } catch (err) {
    console.error(`---> Sentry source map upload failed: ${err.message}`);
  } finally {
    cleanup();
    callback();
  }
}

function buildPackagerOptions() {
  // See: https://github.com/electron-userland/electron-packager/blob/master/usage.txt
  return {
    appVersion: packageJSON.version,
    platform,
    protocols: [
      { name: 'Mailspring Protocol', schemes: ['mailspring'] },
      { name: 'Mailto Protocol', schemes: ['mailto'] },
    ],
    dir: appDir,
    appCategoryType: 'public.app-category.business',
    tmpdir,
    arch: {
      win32: 'x64',
      darwin: process.env.OVERRIDE_TO_INTEL ? 'x64' : process.arch,
      linux: process.arch,
    }[platform],
    icon: {
      darwin: path.resolve(appDir, 'build', 'resources', 'mac', 'mailspring.icns'),
      win32: path.resolve(appDir, 'build', 'resources', 'win', 'mailspring-square.ico'),
      linux: undefined,
    }[platform],
    name: { darwin: 'Mailspring', win32: 'Mailspring', linux: 'mailspring' }[platform],
    appCopyright: `Copyright (C) 2014-${new Date().getFullYear()} Foundry 376, LLC. All rights reserved.`,
    derefSymlinks: false,
    asar: {
      unpack:
        '{' +
        [
          'mailsync',
          'mailsync.exe',
          'mailsync.bin',
          '*.so',
          '*.so.*',
          '*.dll',
          '*.pdb',
          '*.node',
          '**/vendor/**',
          'examples/**',
          '**/src/tasks/**',
          '**/src/quickpreview/**',
          '**/static/all_licenses.html',
          '**/static/extensions/**',
          '**/node_modules/spellchecker/**',
        ].join(',') +
        '}',
    },
    ignore: [
      // top level dirs we never want
      /^\/build.*/,
      /^\/dist.*/,
      /^\/docs.*/,
      /^\/docs_src.*/,
      /^\/script.*/,
      /^\/spec.*/,
      // general dirs we never want
      /[/]+gh-pages$/,
      /[/]+docs$/,
      /[/]+obj[/]+gen/,
      /[/]+\.deps$/,
      // File types we know we never want in the prod build
      /\.md$/i,
      /\.log$/i,
      /\.yml$/i,
      /\.gz/i,
      /\.zip/i,
      /\.h$/,
      /\.cc$/,
      /\.flow$/,
      /\.gyp/,
      /\.mk/,
      /\.dYSM$/,
      /\.map$/,
      // specific (large) module bits we know we don't need
      /node_modules[/]+less[/]+dist$/,
      /node_modules[/]+react[/]+dist$/,
      /node_modules[/].*[/]tests?$/,
      /node_modules[/].*[/]coverage$/,
      /node_modules[/].*[/]benchmark$/,
    ],
    out: outputDir,
    overwrite: true,
    prune: true,
    osxSign: process.env.SIGN_BUILD
      ? {
          platform: 'darwin',
          // The provisioning profile is embedded once into the app bundle at
          // Contents/embedded.provisionprofile. It must be set here at the
          // top level — it is not a per-file option.
          provisioningProfile: process.env.APPLE_PROVISIONING_PROFILE_PATH,
          optionsForFile: filePath => {
            // Only the main app bundle gets the full entitlements plist,
            // which includes restricted entitlements (keychain-access-groups,
            // com.apple.developer.*) that are validated against the embedded
            // provisioning profile. All helper binaries (Electron helpers,
            // mailsync, chrome_crashpad_handler, ShipIt, etc.) must be signed
            // with only the basic com.apple.security.* entitlements — amfid
            // will reject any helper that carries restricted entitlements it
            // cannot match to a profile scoped to that binary.
            // Note: electron-osx-sign passes the .app bundle path (not the
            // inner executable path) when signing the top-level app bundle.
            const isMainExecutable = filePath.endsWith('/Mailspring.app');
            return {
              hardenedRuntime: true,
              entitlements: path.resolve(
                appDir,
                'build',
                'resources',
                'mac',
                isMainExecutable ? 'entitlements.plist' : 'entitlements.child.plist'
              ),
            };
          },
        }
      : undefined,
    osxNotarize: process.env.APPLE_ID
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_ID_PASSWORD,
          ascProvider: process.env.APPLE_ID_ASC_PROVIDER,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : undefined,
    win32metadata: {
      CompanyName: 'Foundry 376, LLC',
      FileDescription: 'Mailspring',
      LegalCopyright: `Copyright (C) 2014-${new Date().getFullYear()} Foundry 376, LLC. All rights reserved.`,
      ProductName: 'Mailspring',
    },
    // NOTE: The following plist keys can NOT be set in the extra.plist since
    // they are manually overridden by electron-packager based on this config:
    //   CFBundleDisplayName, CFBundleExecutable, CFBundleIdentifier, CFBundleName
    // See https://github.com/electron-userland/electron-packager/blob/master/mac.js#L50
    extendInfo: path.resolve(appDir, 'build', 'resources', 'mac', 'extra.plist'),
    appBundleId: 'com.mailspring.mailspring',
    afterCopy: [
      runCopyPlatformSpecificResources,
      runWriteCommitHashIntoPackage,
      runUpdateSandboxHelperPermissions,
      runCopySymlinkedPackages,
      runTranspilers,
      runUploadSourceMapsToSentry,
    ],
  };
}

async function runPackager() {
  const opts = buildPackagerOptions();
  console.log('---> Running packager with options:');
  console.log(util.inspect(opts, true, 7, true));

  const start = Date.now();
  const ongoing = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000.0);
    console.log(`---> Packaging for ${elapsed}s`);
  }, 1000);

  resolveRealSymlinkPaths();

  try {
    const appPaths = await packager(opts);
    console.log(`---> Done Successfully. Built into: ${appPaths}`);
  } finally {
    clearInterval(ongoing);
  }
}

async function createMacZip() {
  const zipPath = path.join(outputDir, 'Mailspring.zip');
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  const arch = process.env.OVERRIDE_TO_INTEL ? 'x64' : process.arch;
  const cwd = path.join(outputDir, `Mailspring-darwin-${arch}`);
  await spawn({
    cmd: 'zip',
    args: ['-9', '-y', '-r', '-9', '-X', zipPath, 'Mailspring.app'],
    opts: { cwd },
  });
  console.log(`>> Created ${zipPath}`);
}

function writeFromTemplate(filePath, data) {
  const template = _.template(String(fs.readFileSync(filePath)));
  const finishedPath = path.join(outputDir, path.basename(filePath).replace('.in', ''));
  writeFileEnsureDir(finishedPath, template(data));
  return finishedPath;
}

const linuxArch = { ia32: 'i386', x64: 'amd64', arm64: 'arm64' }[process.arch];

async function createDebInstaller() {
  if (!linuxArch) throw new Error(`Unsupported arch ${process.arch}`);

  const contentsDir = path.join(outputDir, `mailspring-linux-${process.arch}`);
  const linuxAssetsDir = path.resolve(path.join(buildDir, 'resources', 'linux'));

  // `du` failures (e.g. permission errors) are non-fatal — fall back to a
  // 200MB estimate so the .deb still gets built. Matches the old behavior.
  let installedSize = '200000';
  try {
    const { stdout } = await spawn({ cmd: 'du', args: ['-sk', contentsDir] });
    installedSize = stdout.split(/\s+/).shift() || '200000';
  } catch (err) {
    console.warn(`---> du failed (${err.message}), defaulting installed size to ${installedSize}KB`);
  }

  const data = {
    version: packageJSON.version,
    name: packageJSON.name,
    description: packageJSON.description,
    productName: packageJSON.productName,
    linuxShareDir: '/usr/share/mailspring',
    arch: linuxArch,
    section: 'mail',
    maintainer: 'Mailspring Team <support@getmailspring.com>',
    installedSize,
  };
  writeFromTemplate(path.join(linuxAssetsDir, 'debian', 'control.in'), data);
  writeFromTemplate(path.join(linuxAssetsDir, 'Mailspring.desktop.in'), data);
  writeFromTemplate(path.join(linuxAssetsDir, 'mailspring.appdata.xml.in'), data);

  const icon = path.join(appDir, 'build', 'resources', 'linux', 'icons', '512.png');
  await spawn({
    cmd: path.join(appDir, 'script', 'mkdeb'),
    args: [packageJSON.version, linuxArch, icon, linuxAssetsDir, contentsDir, outputDir],
  });
  console.log(`Created ${outputDir}/mailspring-${packageJSON.version}-${linuxArch}.deb`);
}

async function createRpmInstaller() {
  if (!linuxArch) throw new Error(`Unsupported arch ${process.arch}`);

  const contentsDir = path.join(outputDir, `mailspring-linux-${process.arch}`);
  const linuxAssetsDir = path.resolve(path.join(buildDir, 'resources', 'linux'));
  const rpmDir = path.join(outputDir, 'rpm');
  if (fs.existsSync(rpmDir)) {
    fsPlus.removeSync(rpmDir);
  }

  const templateData = {
    name: packageJSON.name,
    version: packageJSON.version,
    description: packageJSON.description,
    productName: packageJSON.productName,
    linuxShareDir: '/usr/local/share/mailspring',
    linuxAssetsDir,
    contentsDir,
  };

  writeFromTemplate(path.join(linuxAssetsDir, 'redhat', 'mailspring.spec.in'), templateData);
  writeFromTemplate(path.join(linuxAssetsDir, 'Mailspring.desktop.in'), templateData);
  writeFromTemplate(path.join(linuxAssetsDir, 'mailspring.appdata.xml.in'), templateData);

  await spawn({
    cmd: path.join(appDir, 'script', 'mkrpm'),
    args: [outputDir, contentsDir, linuxAssetsDir],
  });
  console.log(`Created rpm package in ${rpmDir}`);
}

async function main() {
  await runPackager();

  if (platform === 'darwin') {
    await createMacZip();
  } else if (platform === 'linux') {
    await createDebInstaller();
    await createRpmInstaller();
  }
  // win32: the electron-winstaller step is run separately by
  // app/build/create-signed-windows-installer.js because of path issues.
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
