import path from 'path';
import fs from 'fs-plus';
import { shell, remote, ipcRenderer } from 'electron';

//some initialization code for chat plugins
window.pluginEpics = [];
window.messageRenders = [];

//epics is an array of epic for redux-observeable, epic should has the signature of
// (action$: Observable<Action>, state$: StateObservable<State>): Observable<Action>;
// see https://redux-observable.js.org/docs/basics/Epics.html for more information
window.addPluginEpics = (...epics) => {
  window.pluginEpics.push.apply(window.pluginEpics, epics);
};
// renderFunc should be a function with signature (msg, idx) => {}
// msg is the message to be rendered;
// idx is its index in the message group
// it should return a React element
// if it return true, false, undefined, msg will be continued to proceccessed by the following messageRenders
window.addMessageRender = (renderFunc) => {
  window.messageRenders.push(renderFunc);
};

window.renderMessageByPlugins = (msg, idx) => {
  for (const render of window.messageRenders) {
    const result = render(msg, idx);
    if (result === true || result === false || result === undefined) {
      continue;
    } else {
      return result;
    }
  }
};

import Package from './package';

export default class PackageManager {
  constructor({ configDirPath, devMode, safeMode, resourcePath, specMode }) {
    this.packageDirectories = [];
    this.resourcePath = resourcePath;
    this.configDirPath = configDirPath;

    this.available = {};
    this.active = {};
    this.waiting = [];

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
            `Unable to read package.json for ${filename}: ${err.toString()}`
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
        if (pkg.syncInit && name !== 'chat') {
          this.activatePackage(pkg);
        } else if (name !== 'chat') {
          this.waiting.push(pkg);
        }
      }
    }
    //ensure edison-beijing-chat is activatd at last
    this.waiting.push(this.available.chat);

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
        `This plugin or theme ${
          pkg.name
        } does not list "mailspring" in it's package.json's "engines" field. Ask the developer to test the plugin with Mailspring and add it, or follow the instructions here: http://support.getmailspring.com/hc/en-us/articles/115001918391`
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
        title: 'Choose a Plugin Directory',
        buttonLabel: 'Choose',
        properties: ['openDirectory'],
      },
      filenames => {
        if (!filenames || filenames.length === 0) {
          return;
        }
        this.installPackageFromPath(filenames[0], (err, packageName) => {
          if (err) {
            AppEnv.showErrorDialog({ title: 'Could not install plugin', message: err.message });
          } else {
            const message = `${packageName} has been installed and enabled. Need to restart! If you don't see the plugin loaded, check the console for errors.`;
            AppEnv.showErrorDialog({ title: 'Plugin installed! 🎉', message });
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
          `The plugin or theme folder you selected doesn't contain a package.json file, or it was invalid JSON. ${err.toString()}`
        )
      );
    }

    if (!json.engines.mailspring) {
      return callback(
        new Error(
          `The plugin or theme you selected has not been upgraded to support Mailspring. If you're the developer, update the package.json's engines field to include "mailspring".\n\nFor more information, see this migration guide: http://support.getmailspring.com/hc/en-us/articles/115001918391`
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
        message: 'Run with debug flags?',
        detail: `To develop plugins, you should run Mailspring with debug flags. This gives you better error messages, the debug version of React, and more. You can disable it at any time from the Developer menu.`,
        buttons: ['OK', 'Cancel'],
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
        title: 'Save New Package',
        defaultPath: devPackagesDir,
        properties: ['createDirectory'],
      },
      newPackagePath => {
        if (!newPackagePath) return;

        const newName = path.basename(newPackagePath);

        if (!newPackagePath.startsWith(devPackagesDir)) {
          return AppEnv.showErrorDialog({
            title: 'Invalid plugin location',
            message: 'Sorry, you must create plugins in the dev/packages folder.',
          });
        }

        if (this.available[newName]) {
          return AppEnv.showErrorDialog({
            title: 'Invalid plugin name',
            message: 'Sorry, you must give your plugin a unique name.',
          });
        }

        if (newName.indexOf(' ') !== -1) {
          return AppEnv.showErrorDialog({
            title: 'Invalid plugin name',
            message: 'Sorry, plugin names cannot contain spaces.',
          });
        }

        fs.mkdir(newPackagePath, err => {
          if (err) {
            return AppEnv.showErrorDialog({
              title: 'Could not create plugin',
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
