const path = require('path');
const createDMG = require('electron-installer-dmg');

module.exports = grunt => {
  grunt.registerTask('create-mac-dmg', 'Create DMG for EdisonMail', function pack() {
    const done = this.async();
    const dmgPath = path.join(grunt.config('outputDir'), 'EdisonMail.dmg');
    createDMG(
      {
        appPath: path.join(grunt.config('outputDir'), 'EdisonMail-darwin-x64', 'EdisonMail.app'),
        name: 'EdisonMail',
        background: path.resolve(
          grunt.config('appDir'),
          'build',
          'resources',
          'mac',
          'DMG-Background.png'
        ),
        icon: path.resolve(grunt.config('appDir'), 'build', 'resources', 'mac', 'edisonMail.icns'),
        overwrite: true,
        out: grunt.config('outputDir'),
      },
      err => {
        if (err) {
          done(err);
          return;
        }

        grunt.log.writeln(`>> Created ${dmgPath}`);
        done(null);
      }
    );
  });
};
