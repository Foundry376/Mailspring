const path = require('path');
const fs = require('fs-plus');

module.exports = grunt => {
  grunt.config.merge({
    nylaslint: {
      src: grunt.config('source:es6'),
    },
  });

  grunt.registerMultiTask(
    'nylaslint',
    'Check requires for file extensions compiled away',
    function nylaslint() {
      const done = this.async();

      // Enable once path errors are fixed.
      if (process.platform === 'win32') {
        done();
        return;
      }

      for (const fileset of this.files) {
        grunt.log.writeln(`Nylinting ${fileset.src.length} files.`);

        const esExtensions = {
          '.es6': true,
          '.es': true,
          '.jsx': true,
        };

        const errors = [];

        const esExport = {};
        const esNoExport = {};
        const esExportDefault = {};

        // Temp TODO. Fix spec files
        for (const f of fileset.src) {
          if (!esExtensions[path.extname(f)]) {
            continue;
          }
          if (!/-spec/.test(f)) {
            continue;
          }

          const content = fs.readFileSync(f, { encoding: 'utf8' });

          // https://regex101.com/r/rQ3eD0/1
          // Matches only the first describe block
          const describeRe = /[\n]describe\(['"](.*?)['"], ?\(\) ?=> ?/m;
          if (describeRe.test(content)) {
            errors.push(`${f}: Spec has to start with function`);
          }
        }

        // Build the list of ES6 files that export things and categorize
        for (const f of fileset.src) {
          if (!esExtensions[path.extname(f)]) {
            continue;
          }
          const lookupPath = `${path.dirname(f)}/${path.basename(f, path.extname(f))}`;
          const content = fs.readFileSync(f, { encoding: 'utf8' });

          if (/^export/gim.test(content)) {
            if (/^export default/gim.test(content)) {
              esExportDefault[lookupPath] = true;
            } else {
              esExport[lookupPath] = true;
            }
          } else {
            esNoExport[lookupPath] = true;
          }
        }

        if (errors.length > 0) {
          for (const err of errors) {
            grunt.log.error(err);
          }
          const error = `
        Please fix the ${errors.length} linter errors above. These are the issues we're looking for:

        ISSUES WITH ES6 FILES:

        4. Don't use module.exports in ES6:
        You sholudn't manually assign module.exports anymore. Use proper ES6 module syntax like "export default" or "export const FOO".

        5. Don't destructure default export:
        If you're using "import {FOO} from './bar'" in ES6 files, it's important that "./bar" does NOT export a "default". Instead, in './bar', do "export const FOO = 'foo'"

        6. Spec has to start with function
        Top-level "describe" blocks can no longer use the "() => {}" function syntax. This will incorrectly bind "this" to the "window" object instead of the jasmine object. The top-level "describe" block must use the "function describeName() {}" syntax
        `;
          done(new Error(error));
        }
      }

      done(null);
    }
  );
};
