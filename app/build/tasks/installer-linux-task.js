/* eslint global-require:0 */
const fs = require('fs');
const path = require('path');
const _ = require('underscore');

module.exports = grunt => {
  const { spawn } = grunt.config('taskHelpers');

  const outputDir = grunt.config.get('outputDir');
  const contentsDir = path.join(grunt.config('outputDir'), `mailspring-linux-${process.arch}`);
  const linuxAssetsDir = path.resolve(path.join(grunt.config('buildDir'), 'resources', 'linux'));
  const arch = {
    ia32: 'i386',
    x64: 'amd64',
  }[process.arch];

  // a few helpers

  const writeFromTemplate = (filePath, data) => {
    const template = _.template(String(fs.readFileSync(filePath)));
    const finishedPath = path.join(outputDir, path.basename(filePath).replace('.in', ''));
    grunt.file.write(finishedPath, template(data));
    return finishedPath;
  };

  const getInstalledSize = (dir, callback) => {
    const cmd = 'du';
    const args = ['-sk', dir];
    spawn({ cmd, args }, (error, { stdout }) => {
      const installedSize = stdout.split(/\s+/).shift() || '200000'; // default to 200MB
      callback(null, installedSize);
    });
  };

  grunt.registerTask('create-rpm-installer', 'Create rpm package', function mkrpmf() {
    const done = this.async();
    if (!arch) {
      done(new Error(`Unsupported arch ${process.arch}`));
      return;
    }

    const rpmDir = path.join(grunt.config('outputDir'), 'rpm');
    if (grunt.file.exists(rpmDir)) {
      grunt.file.delete(rpmDir, { force: true });
    }

    const templateData = {
      name: grunt.config('appJSON').name,
      version: grunt.config('appJSON').version,
      description: grunt.config('appJSON').description,
      productName: grunt.config('appJSON').productName,
      linuxShareDir: '/usr/local/share/mailspring',
      linuxAssetsDir: linuxAssetsDir,
      contentsDir: contentsDir,
    };

    // This populates mailspring.spec
    const specInFilePath = path.join(linuxAssetsDir, 'redhat', 'mailspring.spec.in');
    writeFromTemplate(specInFilePath, templateData);

    // This populates Mailspring.desktop
    const desktopInFilePath = path.join(linuxAssetsDir, 'Mailspring.desktop.in');
    writeFromTemplate(desktopInFilePath, templateData);

    // This populates mailspring.appdata.xml
    const appdataInFilePath = path.join(linuxAssetsDir, 'mailspring.appdata.xml.in');
    writeFromTemplate(appdataInFilePath, templateData);

    const cmd = path.join(grunt.config('appDir'), 'script', 'mkrpm');
    const args = [outputDir, contentsDir, linuxAssetsDir];
    spawn({ cmd, args }, error => {
      if (error) {
        return done(error);
      }
      grunt.log.ok(`Created rpm package in ${rpmDir}`);
      return done();
    });
  });

  grunt.registerTask('create-deb-installer', 'Create debian package', function mkdebf() {
    const done = this.async();
    if (!arch) {
      done(`Unsupported arch ${process.arch}`);
      return;
    }

    getInstalledSize(contentsDir, (error, installedSize) => {
      if (error) {
        done(error);
        return;
      }

      const version = grunt.config('appJSON').version;
      const data = {
        version: version,
        name: grunt.config('appJSON').name,
        description: grunt.config('appJSON').description,
        productName: grunt.config('appJSON').productName,
        linuxShareDir: '/usr/share/mailspring',
        arch: arch,
        section: 'mail',
        maintainer: 'Mailspring Team <support@getmailspring.com>',
        installedSize: installedSize,
      };
      writeFromTemplate(path.join(linuxAssetsDir, 'debian', 'control.in'), data);
      writeFromTemplate(path.join(linuxAssetsDir, 'Mailspring.desktop.in'), data);
      writeFromTemplate(path.join(linuxAssetsDir, 'mailspring.appdata.xml.in'), data);

      const icon = path.join(
        grunt.config('appDir'),
        'build',
        'resources',
        'linux',
        'icons',
        '512.png'
      );
      const cmd = path.join(grunt.config('appDir'), 'script', 'mkdeb');
      const args = [version, arch, icon, linuxAssetsDir, contentsDir, outputDir];
      spawn({ cmd, args }, spawnError => {
        if (spawnError) {
          return done(spawnError);
        }
        grunt.log.ok(`Created ${outputDir}/mailspring-${version}-${arch}.deb`);
        return done();
      });
    });
  });
};
