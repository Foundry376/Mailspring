/* eslint global-require: 0 */ /* eslint prefer-template: 0 */
/* eslint quote-props: 0 */
const packager = require('electron-packager');
const path = require('path');
const util = require('util');
const tmpdir = path.resolve(require('os').tmpdir(), 'nylas-build');
const fs = require('fs-plus');
const glob = require('glob');
const babel = require('babel-core');
const { execSync } = require('child_process');
const symlinkedPackages = [];

module.exports = grunt => {
  const packageJSON = grunt.config('appJSON');
  const babelPath = path.join(grunt.config('rootDir'), '.babelrc');
  const babelOptions = JSON.parse(fs.readFileSync(babelPath));

  function runCopyPlatformSpecificResources(buildPath, electronVersion, platform, arch, callback) {
    // these files (like nylas-mailto-default.reg) go alongside the ASAR,
    // not inside it, so we need to move out of the `app` directory.
    const resourcesDir = path.resolve(buildPath, '..');
    if (platform === 'win32') {
      fs.copySync(path.resolve(grunt.config('appDir'), 'build', 'resources', 'win'), resourcesDir);
    }
    callback();
  }

  function runWriteCommitHashIntoPackage(buildPath, electronVersion, platform, arch, callback) {
    const commit = execSync('git rev-parse HEAD').toString();
    const jsonPath = path.resolve(buildPath, 'package.json');
    let jsonString = fs.readFileSync(jsonPath).toString();
    jsonString = jsonString.replace('COMMIT_INSERTED_DURING_PACKAGING', commit.substr(0, 8));
    fs.writeFileSync(jsonPath, jsonString);
    callback();
  }
  /**
   * We have to resolve the symlink paths (and cache the results) before
   * copying over the files since some symlinks may be relative paths (like
   * those created by lerna). We'll keep absolute references of those paths
   * for the symlink copy function to use after the packaging is complete.
   */
  function resolveRealSymlinkPaths(appDir) {
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

  function runCopySymlinkedPackages(buildPath, electronVersion, platform, arch, callback) {
    console.log('---> Moving symlinked node modules / internal packages into build folder.');

    symlinkedPackages.forEach(({ realPackagePath, relativePackageDir }) => {
      const packagePath = path.join(buildPath, relativePackageDir);
      console.log(`  ---> Copying ${realPackagePath} to ${packagePath}`);
      fs.removeSync(packagePath);
      fs.copySync(realPackagePath, packagePath);
    });

    callback();
  }

  function runTranspilers(buildPath, electronVersion, platform, arch, callback) {
    console.log('---> Running Babel');

    grunt.config('source:es6').forEach(pattern => {
      glob.sync(pattern, { cwd: buildPath }).forEach(relPath => {
        const es6Path = path.join(buildPath, relPath);
        if (/(node_modules|\.js$)/.test(es6Path)) return;
        const outPath = es6Path.replace(path.extname(es6Path), '.js');
        console.log(`  ---> Compiling ${es6Path.slice(es6Path.indexOf('/app') + 4)}`);
        const res = babel.transformFileSync(
          es6Path,
          Object.assign(babelOptions, {
            sourceMaps: true,
            sourceRoot: '/',
            sourceMapTarget: path.relative(buildPath, outPath),
            sourceFileName: path.relative(buildPath, es6Path),
          })
        );
        grunt.file.write(
          outPath,
          `${res.code}\n//# sourceMappingURL=${path.basename(outPath)}.map\n`
        );
        grunt.file.write(`${outPath}.map`, JSON.stringify(res.map));
        fs.unlinkSync(es6Path);
      });
    });

    callback();
  }

  const platform = grunt.option('platform');

  // See: https://github.com/electron-userland/electron-packager/blob/master/usage.txt
  grunt.config.merge({
    packager: {
      appVersion: packageJSON.version,
      platform: platform,
      protocols: [
        {
          name: 'Mailspring Protocol',
          schemes: ['mailspring'],
        },
        {
          name: 'Mailto Protocol',
          schemes: ['mailto'],
        },
      ],
      dir: grunt.config('appDir'),
      appCategoryType: 'public.app-category.business',
      tmpdir: tmpdir,
      arch: {
        win32: 'ia32',
      }[platform],
      icon: {
        darwin: path.resolve(
          grunt.config('appDir'),
          'build',
          'resources',
          'mac',
          'edisonMail.icns'
        ),
        win32: path.resolve(grunt.config('appDir'), 'build', 'resources', 'win', 'mailspring.ico'),
        linux: undefined,
      }[platform],
      name: {
        darwin: 'Edison Mail',
        win32: 'Edison Mail',
        linux: 'Edison Mail',
      }[platform],
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
            '**/node_modules/spellchecker/**',
            '**/node_modules/windows-shortcuts/**',
          ].join(',') +
          '}',
      },
      ignore: [
        // These are all relative to client-app
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
        /\.pdb$/,
        /\.h$/,
        /\.cc$/,
        /\.ts$/,
        /\.flow$/,
        /\.gyp/,
        /\.mk/,
        /\.dYSM$/,

        // specific (large) module bits we know we don't need
        /node_modules[/]+less[/]+dist$/,
        /node_modules[/]+react[/]+dist$/,
        /node_modules[/].*[/]tests?$/,
        /node_modules[/].*[/]coverage$/,
        /node_modules[/].*[/]benchmark$/,
        /@paulbetts[/]+cld[/]+deps[/]+cld/,
      ],
      out: grunt.config('outputDir'),
      overwrite: true,
      prune: true,
      /**
       * This will automatically look for the identity in the keychain. It
       * runs the `security find-identity` command. Note that
       * setup-mac-keychain-task needs to be run first
       */
      osxSign: !!process.env.SIGN_BUILD,
      win32metadata: {
        CompanyName: 'Foundry 376, LLC',
        FileDescription: 'Mailspring',
        LegalCopyright: `Copyright (C) 2014-${new Date().getFullYear()} Foundry 376, LLC. All rights reserved.`,
        ProductName: 'Mailspring',
      },
      // NOTE: The following plist keys can NOT be set in the
      // extra.plist since they are manually overridden by
      // electron-packager based on this config file:
      //
      // CFBundleDisplayName: 'name',
      // CFBundleExecutable: 'name',
      // CFBundleIdentifier: 'app-bundle-id',
      // CFBundleName: 'name'
      //
      // See https://github.com/electron-userland/electron-packager/blob/master/mac.js#L50
      //
      // Our own extra.plist gets extended on top of the
      // Electron.app/Contents/Info.plist. A majority of the defaults are
      // left in the Electron Info.plist file
      extendInfo: path.resolve(grunt.config('appDir'), 'build', 'resources', 'mac', 'extra.plist'),
      appBundleId: 'com.mailspring.mailspring',
      afterCopy: [
        runCopyPlatformSpecificResources,
        runWriteCommitHashIntoPackage,
        runCopySymlinkedPackages,
        runTranspilers,
      ],
    },
  });

  grunt.registerTask('package', 'Package Mailspring', function pack() {
    const done = this.async();
    const start = Date.now();

    console.log('---> Running packager with options:');
    console.log(util.inspect(grunt.config.get('packager'), true, 7, true));

    const ongoing = setInterval(() => {
      const elapsed = Math.round((Date.now() - start) / 1000.0);
      console.log(`---> Packaging for ${elapsed}s`);
    }, 1000);

    resolveRealSymlinkPaths(grunt.config('appDir'));

    packager(grunt.config.get('packager'), (err, appPaths) => {
      clearInterval(ongoing);
      if (err) {
        grunt.fail.fatal(err);
        return done(err);
      }
      console.log(`---> Done Successfully. Built into: ${appPaths}`);
      return done();
    });
  });
};
