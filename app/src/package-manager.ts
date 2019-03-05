import path from 'path';
import fs from 'fs-plus';
import { shell, remote, ipcRenderer } from 'electron';
import { localized } from './intl';
import Package from './package';

export default class PackageManager {
  packageDirectories: string[] = [];
  waiting: Package[] = [];
  available: { [packageName: string]: Package } = {};
  active: { [packageName: string]: Package } = {};
  resourcePath: string;
  configDirPath: string;

  constructor({ configDirPath, devMode, safeMode, resourcePath, specMode }) {
    this.resourcePath = resourcePath;
    this.configDirPath = configDirPath;

    if (specMode) {
      this.packageDirectories.push(path.join(resourcePath, 'spec', 'fixtures', 'packages'));
    } else {
      this.packageDirectories.push(path.join(resourcePath, 'internal_packages'));
      if (!safeMode) {
        this.packageDirectories.push(path.join(configDirPath, 'packages'));
        if (devMode) {
          this.packageDirectories.push(path.join(configDirPath, 'dev', 'packages'));
        }
      }
    }

    this.discoverPackages();
  }

  discoverPackages() {
    for (const dir of this.packageDirectories) {
      let filenames = [];
      try {
        filenames = fs.readdirSync(dir);
      } catch (err) {
        continue;
      }

      for (const filename of filenames) {
        let pkg = null;
        try {
          pkg = new Package(path.join(dir, filename));
          this.available[pkg.name] = pkg;
        } catch (err) {
          if (err instanceof Package.NoPackageJSONError) {
            continue;
          }
          const wrapped = new Error(
            localized(`Unable to read package.json for %@: %@`, filename, err.toString())
          );
          AppEnv.reportError(wrapped);
        }
      }
    }
  }

  activatePackages(windowType) {
    for (const name of Object.keys(this.available)) {
      const pkg = this.available[name];

      if (pkg.windowTypes[windowType] || pkg.windowTypes.all) {
        if (pkg.syncInit) {
          this.activatePackage(pkg);
        } else {
          this.waiting.push(pkg);
        }
      }
    }

    setTimeout(() => {
      for (const w of this.waiting) {
        this.activatePackage(w);
      }
      this.waiting = [];
    }, 2500);
  }

  activatePackage(pkg) {
    if (this.active[pkg.name]) {
      return;
    }

    if (!pkg || pkg.isTheme()) {
      return;
    }

    const disabled = AppEnv.config.get('core.disabledPackages');
    if (pkg.isOptional() && disabled.includes(pkg.name)) {
      return;
    }

    if (!pkg.json.engines.mailspring) {
      // don't use AppEnv.reportError, I don't want to know about these.
      console.error(
        localized(
          `This plugin or theme %@ does not list "mailspring" in it's package.json's "engines" field. Ask the developer to test the plugin with Mailspring and add it, or follow the instructions here: %@`,
          pkg.name,
          `http://support.getmailspring.com/hc/en-us/articles/115001918391`
        )
      );
      return;
    }

    this.active[pkg.name] = pkg;
    pkg.activate();
  }

  deactivatePackages() {}

  getAvailablePackages() {
    return Object.values(this.available);
  }

  getActivePackages() {
    return Object.values(this.active);
  }

  getPackageNamed(packageName) {
    return this.available[packageName];
  }

  // Installing and Creating Packages

  installPackageManually() {
    AppEnv.showOpenDialog(
      {
        title: localized('Choose Directory'),
        buttonLabel: localized('Choose'),
        properties: ['openDirectory'],
      },
      filenames => {
        if (!filenames || filenames.length === 0) {
          return;
        }
        this.installPackageFromPath(filenames[0], (err, packageName) => {
          if (err) {
            AppEnv.showErrorDialog({
              title: localized('Could not install plugin'),
              message: err.message,
            });
          } else {
            const message = localized(
              `%@ has been installed and enabled. No need to restart! If you don't see the plugin loaded, check the console for errors.`,
              packageName
            );
            AppEnv.showErrorDialog({ title: localized('Plugin installed! 🎉'), message });
          }
        });
      }
    );
  }

  installPackageFromPath(packagePath, callback) {
    // check that the path contains a package.json file
    let json = null;
    try {
      json = require(path.join(packagePath, 'package.json'));
    } catch (err) {
      return callback(
        new Error(
          localized(
            `The plugin or theme folder you selected doesn't contain a package.json file, or it was invalid JSON. %@`,
            err.toString()
          )
        )
      );
    }

    if (!json.engines || !json.engines.mailspring) {
      return callback(
        new Error(
          localized(
            `The plugin or theme you selected has not been upgraded to support Mailspring. If you're the developer, update the package.json's engines field to include "mailspring".\n\nFor more information, see this migration guide: %@`,
            `http://support.getmailspring.com/hc/en-us/articles/115001918391`
          )
        )
      );
    }

    // copy the package into a new directory based on it's name
    const packageFinalDir = path.join(this.configDirPath, 'packages', json.name);
    fs.copySync(packagePath, packageFinalDir);

    // activate the package
    const pkg = new Package(packageFinalDir);
    this.available[pkg.name] = pkg;
    if (pkg.isTheme()) {
      AppEnv.themes.setActiveTheme(pkg.name);
    } else {
      this.activatePackage(pkg);
    }
    callback(null, pkg.name);
  }

  createPackageManually() {
    if (!AppEnv.inDevMode()) {
      const btn = remote.dialog.showMessageBox({
        type: 'warning',
        message: localized('Run with debug flags?'),
        detail: localized(
          `To develop plugins, you should run Mailspring with debug flags. This gives you better error messages, the debug version of React, and more. You can disable it at any time from the Developer menu.`
        ),
        buttons: [localized('OK'), localized('Cancel')],
      });
      if (btn === 0) {
        ipcRenderer.send('command', 'application:toggle-dev');
      }
      return;
    }

    const devPackagesDir = path.join(this.configDirPath, 'dev', 'packages');
    fs.makeTreeSync(devPackagesDir);

    AppEnv.showSaveDialog(
      {
        title: localized('Save New Package'),
        defaultPath: devPackagesDir,
        properties: ['createDirectory'],
      },
      newPackagePath => {
        if (!newPackagePath) return;

        const newName = path.basename(newPackagePath);

        if (!newPackagePath.startsWith(devPackagesDir)) {
          return AppEnv.showErrorDialog({
            title: localized('Invalid plugin location'),
            message: localized('Sorry, you must create plugins in the dev/packages folder.'),
          });
        }

        if (this.available[newName]) {
          return AppEnv.showErrorDialog({
            title: localized('Invalid plugin name'),
            message: localized('Sorry, you must give your plugin a unique name.'),
          });
        }

        if (newName.indexOf(' ') !== -1) {
          return AppEnv.showErrorDialog({
            title: localized('Invalid plugin name'),
            message: localized('Sorry, plugin names cannot contain spaces.'),
          });
        }

        fs.mkdir(newPackagePath, err => {
          if (err) {
            return AppEnv.showErrorDialog({
              title: localized('Could not create plugin'),
              message: err.toString(),
            });
          }

          const templatePath = path.join(this.resourcePath, 'static', 'package-template');
          fs.copySync(templatePath, newPackagePath);

          const packageJSON = require(path.join(templatePath, 'package.json'));
          packageJSON.name = newName;
          packageJSON.engines.mailspring = `>=${AppEnv.getVersion().split('-')[0]}`;
          fs.writeFileSync(
            path.join(newPackagePath, 'package.json'),
            JSON.stringify(packageJSON, null, 2)
          );

          setTimeout(() => {
            // show the package in the finder
            shell.showItemInFolder(newPackagePath);

            // load the package into the app
            const pkg = new Package(newPackagePath);
            this.available[pkg.name] = pkg;
            this.activatePackage(pkg);
          }, 0);
        });
      }
    );
  }
}
