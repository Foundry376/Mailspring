import path from 'path';
import fs from 'fs';
import { shell } from 'electron';
import { localized } from './intl';
import Package, { isValidPackageName } from './package';

export default class PackageManager {
  packageDirectories: string[] = [];
  waiting: Package[] = [];
  available: { [packageName: string]: Package } = {};
  active: { [packageName: string]: Package } = {};
  resourcePath: string;
  configDirPath: string;
  identityPresent: boolean;

  constructor({
    configDirPath,
    devMode,
    safeMode,
    resourcePath,
    specMode,
  }: {
    configDirPath: string;
    devMode: boolean;
    safeMode: boolean;
    resourcePath: string;
    specMode: boolean;
  }) {
    this.resourcePath = resourcePath;
    this.configDirPath = configDirPath;
    this.identityPresent = !!AppEnv.config.get('identity');

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

    // If the user starts without a Mailspring ID and then links one, immediately turn on the
    // packages that require it. (Note: When you log OUT we currently just reboot the app, so
    // this only goes one way, which is also convenient because unloading the built-in packages
    // hasn't been tested much.)

    // Note: Ideally we'd use the IdentityStore here but we can't load it this early in app
    // launch without introducing a circular import.
    AppEnv.config.onDidChange('identity', () => {
      if (!this.identityPresent && !!AppEnv.config.get('identity')) {
        this.identityPresent = true;
        this.activatePackages(AppEnv.getLoadSettings().windowType);
      }
    });
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
          if (err instanceof Package.InvalidPackageNameError) {
            console.error(err.message);
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

  activatePackages(windowType: string) {
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

  activatePackage(pkg: Package) {
    if (this.active[pkg.name]) {
      return;
    }

    if (!pkg || pkg.isTheme()) {
      return;
    }

    const disabled = AppEnv.config.get('core.disabledPackages');
    if (pkg.isOptional() && Array.isArray(disabled) && disabled.includes(pkg.name)) {
      return;
    }

    if (pkg.isIdentityRequired() && !this.identityPresent) {
      return;
    }

    if (!pkg.isEngineSet()) {
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

    try {
      this.active[pkg.name] = pkg;
      pkg.activate();
    } catch (err) {
      delete this.active[pkg.name];
      for (const d of pkg.disposables) {
        d.dispose();
      }
      pkg.disposables = [];
      const message = localized(
        `Failed to activate plugin %@: %@`,
        pkg.name,
        err.message || err.toString()
      );
      // Only report activation failures for built-in packages. User-installed
      // third-party plugins can fail for many reasons outside our control
      // (stale APIs, missing deps, etc.) and reporting them to Sentry creates
      // noise that we cannot act on.
      if (pkg.directory.startsWith(this.resourcePath)) {
        AppEnv.reportError(new Error(message));
      } else {
        console.error(message, err);
      }
    }
  }

  deactivatePackages() {}

  getAvailablePackages() {
    return Object.values(this.available);
  }

  getActivePackages() {
    return Object.values(this.active);
  }

  getPackageNamed(packageName: string) {
    return this.available[packageName];
  }

  isPackageActive(packageName: string) {
    return packageName in this.active;
  }

  // Installing and Creating Packages

  installPackageManually() {
    const response = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [localized('Cancel'), localized('Continue')],
      defaultId: 0,
      cancelId: 0,
      message: localized('Only install plugins from sources you trust'),
      detail: localized(
        'Mailspring plugins run in the application and have access to your email data. Only install plugins from developers you trust.'
      ),
    });
    if (response !== 1) {
      return;
    }
    AppEnv.showOpenDialog(
      {
        title: localized('Choose Directory'),
        buttonLabel: localized('Choose'),
        properties: ['openDirectory'],
      },
      (filenames) => {
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

  installPackageFromPath(packagePath: string, callback) {
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

    if (!isValidPackageName(json.name)) {
      return callback(
        new Error(
          localized(
            `The plugin or theme you selected has an invalid or missing "name" field in its package.json. Names must match /^[a-zA-Z0-9._-]+$/.`
          )
        )
      );
    }

    // copy the package into a new directory based on it's name
    const packagesRoot = path.join(this.configDirPath, 'packages');
    const packageFinalDir = path.join(packagesRoot, json.name);
    const resolvedFinalDir = path.resolve(packageFinalDir);
    const resolvedPackagesRoot = path.resolve(packagesRoot);
    if (
      resolvedFinalDir !== path.join(resolvedPackagesRoot, json.name) ||
      path.dirname(resolvedFinalDir) !== resolvedPackagesRoot
    ) {
      return callback(
        new Error(
          localized(
            `The plugin or theme you selected has an unsafe "name" field in its package.json.`
          )
        )
      );
    }
    let pkg: Package;
    try {
      fs.cpSync(packagePath, packageFinalDir, { recursive: true });
      pkg = new Package(packageFinalDir);
    } catch (err) {
      try {
        fs.rmSync(packageFinalDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // best effort
      }
      return callback(
        new Error(
          localized(
            `Failed to install the plugin or theme: %@`,
            err && err.message ? err.message : err.toString()
          )
        )
      );
    }

    // activate the package
    this.available[pkg.name] = pkg;
    if (pkg.isTheme()) {
      AppEnv.themes.setActiveTheme(pkg.name);
    } else {
      this.activatePackage(pkg);
    }
    callback(null, pkg.name);
  }

  createPackageManually() {
    shell.openExternal('https://github.com/Foundry376/Mailspring-Plugin-Starter');
  }
}
