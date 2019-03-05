/* eslint global-require: 0 */
/* eslint import/no-dynamic-require: 0 */
const path = require('path');

module.exports = grunt => {
  if (!grunt.option('platform')) {
    grunt.option('platform', process.platform);
  }

  /**
   * The main appDir is that of the root nylas-mail-all repo. This Gruntfile
   * is designed to be run from the npm-build-client task whose repo root is
   * the main nylas-mail-all package.
   */
  const appDir = path.resolve(path.join('app'));
  const buildDir = path.join(appDir, 'build');
  const tasksDir = path.join(buildDir, 'tasks');
  const taskHelpers = require(path.join(tasksDir, 'task-helpers'))(grunt);

  // This allows all subsequent paths to the relative to the root of the repo
  grunt.config.init({
    taskHelpers: taskHelpers,
    rootDir: path.resolve('./'),
    buildDir: buildDir,
    appDir: appDir,
    classDocsOutputDir: path.join(buildDir, 'docs_src', 'classes'),
    outputDir: path.join(appDir, 'dist'),
    appJSON: grunt.file.readJSON(path.join(appDir, 'package.json')),
    'source:es6': [
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
    ],
  });

  grunt.loadTasks(tasksDir);
  grunt.file.setBase(appDir);

  grunt.registerTask('docs', ['docs-build', 'docs-render']);

  grunt.registerTask('lint', ['eslint', 'lesslint', 'csslint']);

  if (grunt.option('platform') === 'win32') {
    grunt.registerTask('build-client', [
      'package',
      // The Windows electron-winstaller task must be run outside of grunt
    ]);
  } else if (grunt.option('platform') === 'darwin') {
    grunt.registerTask('build-client', ['package', 'create-mac-zip', 'create-mac-dmg']);
  } else if (grunt.option('platform') === 'linux') {
    grunt.registerTask('build-client', ['package', 'create-deb-installer', 'create-rpm-installer']);
  }
};
