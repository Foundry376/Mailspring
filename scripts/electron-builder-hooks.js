/**
 * electron-builder afterPack hook.
 *
 * This runs after electron-builder has assembled the app directory but before
 * creating the final distributable. It replaces several afterCopy hooks from
 * the old @electron/packager pipeline:
 *
 *  1. Inject the git commit hash into package.json
 *  2. Copy Windows-specific resources alongside the ASAR (registry files, etc.)
 *  3. Fix chrome-sandbox permissions on Linux
 *  4. Copy symlinked packages (lerna/npm link) into the build
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;

  // The app resources directory varies by platform:
  //   macOS: Mailspring.app/Contents/Resources/app.asar (unpacked: app.asar.unpacked/)
  //   Linux/Win: resources/app.asar (unpacked: app.asar.unpacked/)
  const resourcesDir =
    electronPlatformName === 'darwin'
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(appOutDir, 'resources');

  // 1. Inject git commit hash into package.json inside the asar unpacked dir
  // electron-builder extracts to app.asar.unpacked when asarUnpack is set
  const unpackedAppDir = path.join(resourcesDir, 'app.asar.unpacked');
  const packageJsonPath = path.join(unpackedAppDir, 'package.json');

  // The package.json may be inside the asar, so try the unpacked location first,
  // then fall back to modifying the asar contents via electron-builder's API.
  // For now, we inject the commit hash before asar packing by modifying the source.
  // electron-builder runs afterPack AFTER asar creation, so we handle this in beforeBuild instead.
  // See: inject-commit-hash.js which runs as a beforeBuild step.

  // 2. Copy Windows resources alongside the ASAR
  if (electronPlatformName === 'win32') {
    const winResourcesSource = path.resolve(__dirname, '..', 'app', 'build', 'resources', 'win');
    const targetDir = appOutDir;
    const filesToCopy = [
      'elevate.cmd',
      'elevate.vbs',
      'mailspring-mailto-default.reg',
      'mailspring-mailto-registration.reg',
      'mailspring.VisualElementsManifest.xml',
      'mailspring-150px.png',
      'mailspring-75px.png',
    ];
    for (const file of filesToCopy) {
      const src = path.join(winResourcesSource, file);
      const dest = path.join(targetDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`  afterPack: copied ${file} to ${targetDir}`);
      }
    }
  }

  // 3. Fix chrome-sandbox permissions on Linux
  if (electronPlatformName === 'linux') {
    const helperPath = path.join(appOutDir, 'chrome-sandbox');
    if (fs.existsSync(helperPath)) {
      fs.chmodSync(helperPath, 0o4755);
      console.log('  afterPack: set chrome-sandbox permissions to 4755');
    }
  }

  // 4. Resolve and copy symlinked packages
  // In development, lerna or npm link may create symlinks in node_modules,
  // internal_packages, etc. electron-builder's derefSymlinks should handle most
  // cases, but we keep this for safety.
  const appDir = path.resolve(__dirname, '..', 'app');
  const dirsToCheck = ['internal_packages', 'src', 'node_modules'];
  const asarUnpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

  for (const dir of dirsToCheck) {
    const absoluteDir = path.join(appDir, dir);
    if (!fs.existsSync(absoluteDir)) continue;

    const entries = fs.readdirSync(absoluteDir);
    for (const entry of entries) {
      const entryPath = path.join(absoluteDir, entry);
      try {
        const realPath = fs.realpathSync(entryPath);
        if (realPath !== entryPath && realPath !== entryPath.replace('/private/', '/')) {
          // This is a symlink — the contents should already be dereferenced by
          // electron-builder, but log it for debugging.
          console.log(`  afterPack: symlink detected: ${dir}/${entry} -> ${realPath}`);
        }
      } catch {
        // Ignore errors from broken symlinks
      }
    }
  }
};
