const path = require('path');
const rimraf = require('rimraf');

const fs = require('fs-plus');
var fs_extra = require('fs-extra');

const joanna = require('joanna');
const tello = require('tello');

module.exports = function(grunt) {
  let { cp, mkdir, rm } = grunt.config('taskHelpers');

  let getClassesToInclude = function() {
    let modulesPath = path.resolve(__dirname, '..', '..', 'internal_packages');
    let classes = {};
    fs.traverseTreeSync(modulesPath, function(modulePath) {
      // Don't traverse inside dependencies
      if (modulePath.match(/node_modules/g)) {
        return false;
      }

      // Don't traverse blacklisted packages (that have docs, but we don't want to include)
      if (path.basename(modulePath) !== 'package.json') {
        return true;
      }
      if (!fs.isFileSync(modulePath)) {
        return true;
      }

      let apiPath = path.join(path.dirname(modulePath), 'api.json');
      if (fs.isFileSync(apiPath)) {
        Object.assign(classes, grunt.file.readJSON(apiPath).classes);
      }
      return true;
    });
    return classes;
  };

  let sortClasses = function(classes) {
    let sortedClasses = {};
    for (let className of Array.from(Object.keys(classes).sort())) {
      sortedClasses[className] = classes[className];
    }
    return sortedClasses;
  };

  return grunt.registerTask('docs-build', 'Builds the API docs in src', function() {
    grunt.log.writeln('Time to build the docs!');

    let done = this.async();

    let classDocsOutputDir = grunt.config.get('classDocsOutputDir');

    let cjsxOutputDir = path.join(classDocsOutputDir, 'temp-cjsx');

    return rimraf(cjsxOutputDir, function() {
      let api;
      fs.mkdir(cjsxOutputDir);

      let srcPath = path.resolve(__dirname, '..', '..', 'src');

      const blacklist = ['legacy-edgehill-api', 'edgehill-api'];

      let in_blacklist = function(file) {
        for (var i = 0; i < blacklist.length; i++) {
          if (file.indexOf(blacklist[i]) >= 0) {
            return true;
          }
        }
        return false;
      };

      fs.traverseTreeSync(srcPath, function(file) {
        if (in_blacklist(file)) {
          console.log('Skipping ' + file);
          // Skip K2
        } else if (path.extname(file) === '.jsx') {
          console.log('Transforming ' + file);

          let fileStr = grunt.file.read(file);

          let transformed = require('babel-core').transform(fileStr, {
            plugins: ['transform-react-jsx', 'transform-class-properties'],
            presets: ['react', 'electron'],
          });

          grunt.file.write(
            path.join(cjsxOutputDir, path.basename(file).slice(0, -3 || undefined) + 'js'),
            transformed.code
          );
        } else if (path.extname(file) === '.js') {
          let dest_path = path.join(cjsxOutputDir, path.basename(file));
          console.log('Copying ' + file + ' to ' + dest_path);
          fs_extra.copySync(file, dest_path);
        }
        return true;
      });

      // DEBUG
      // Use to check individual files
      var js_files = [];
      fs.traverseTreeSync(cjsxOutputDir, function(file) {
        if (path.extname(file) === '.js') {
          console.log('testing joanna on ' + file);
          let meta = joanna([file]);
          console.log('testing tello on ' + file);
          tello.digest(meta);
          console.log('passed');
        }
      });

      fs.traverseTreeSync(cjsxOutputDir, function(file) {
        if (path.extname(file) === '.js') {
          js_files.push(file.toString());
        }
      });

      console.log(js_files);
      grunt.log.ok('---- Starting Jonna (jsx metadata)----');
      let metadata = joanna(js_files);
      grunt.log.ok('---- Done with Joanna (jsx metadata)----');

      grunt.file.write('/tmp/metadata.json', JSON.stringify(metadata, null, 2));

      try {
        api = tello.digest(metadata);
      } catch (e) {
        console.log(e);
        console.log(e.stack);

        console.log(metadata);
        return;
      }

      console.log('---- Done with Tello ----');
      Object.assign(api.classes, getClassesToInclude());

      console.log(api.classes);

      api.classes = sortClasses(api.classes);
      console.log(api.classes);

      let apiJson = JSON.stringify(api, null, 2);
      let apiJsonPath = path.join(classDocsOutputDir, 'api.json');
      grunt.file.write(apiJsonPath, apiJson);
      return done();
    });
  });
};
