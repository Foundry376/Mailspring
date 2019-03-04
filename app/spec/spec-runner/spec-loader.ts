/* eslint global-require: 0 */
/* eslint import/no-dynamic-require: 0 */
import _ from 'underscore';
import fs from 'fs-plus';
import path from 'path';

class N1SpecLoader {
  loadSpecs(loadSettings, jasmineEnv) {
    this.jasmineEnv = jasmineEnv;
    this.loadSettings = loadSettings;
    if (this.loadSettings.specDirectory) {
      this._loadSpecsInDir(this.loadSettings.specDirectory);
      this._setSpecType('user');
    } else {
      this._loadAllSpecs();
    }
  }

  _loadAllSpecs() {
    const { resourcePath } = this.loadSettings;

    this._loadSpecsInDir(path.join(resourcePath, 'spec'));

    this._setSpecType('core');

    const fixturesPackagesPath = path.join(__dirname, 'fixtures', 'packages');

    // EDGEHILL_CORE: Look in internal_packages instead of node_modules
    let packagePaths = [];
    const iterable = fs.listSync(path.join(resourcePath, 'internal_packages'));
    for (let i = 0; i < iterable.length; i++) {
      const packagePath = iterable[i];
      if (fs.isDirectorySync(packagePath)) {
        packagePaths.push(packagePath);
      }
    }

    packagePaths = _.uniq(packagePaths);

    packagePaths = _.groupBy(packagePaths, packagePath => {
      if (packagePath.indexOf(`${fixturesPackagesPath}${path.sep}`) === 0) {
        return 'fixtures';
      } else if (packagePath.indexOf(`${resourcePath}${path.sep}`) === 0) {
        return 'bundled';
      }
      return 'user';
    });

    // Run bundled package specs
    const iterable1 = packagePaths.bundled != null ? packagePaths.bundled : [];

    for (let j = 0; j < iterable1.length; j++) {
      const packagePath = iterable1[j];
      this._loadSpecsInDir(path.join(packagePath, 'specs'));
    }
    this._setSpecType('bundled');

    // Run user package specs
    const iterable2 = packagePaths.user != null ? packagePaths.user : [];
    for (let k = 0; k < iterable2.length; k++) {
      const packagePath = iterable2[k];
      this._loadSpecsInDir(path.join(packagePath, 'specs'));
    }
    return this._setSpecType('user');
  }

  _loadSpecsInDir(specDirectory) {
    const { specFilePattern } = this.loadSettings;

    let regex = /-spec\.(js|jsx|es6|es|ts|tsx)$/;
    if (typeof specFilePattern === 'string' && specFilePattern.length > 0) {
      regex = new RegExp(specFilePattern);
    }

    for (const specFilePath of fs.listTreeSync(specDirectory)) {
      if (regex.test(specFilePath)) {
        try {
          require(specFilePath);
        } catch (err) {
          throw new Error(`Error requiring spec file: ${specFilePath}: ${err.toString()}`);
        }
      }
    }

    this._setSpecDirectory(specDirectory);
  }

  _setSpecDirectory(specDirectory) {
    this._setSpecField('specDirectory', specDirectory);
  }

  _setSpecField(name, value) {
    const specs = this.jasmineEnv.currentRunner().specs();
    if (specs.length === 0) {
      return;
    }

    for (let i = 0; i < specs.length; i++) {
      if (specs[i][name]) break;
      specs[i][name] = value;
    }
  }

  _setSpecType(specType) {
    this._setSpecField('specType', specType);
  }
}
export default new N1SpecLoader();
