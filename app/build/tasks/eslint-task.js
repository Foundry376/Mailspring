const chalk = require('chalk');
const eslint = require('eslint');

module.exports = grunt => {
  grunt.config.merge({
    eslint: {
      options: {
        configFile: '../.eslintrc',
        parserOptions: {
          project: './tsconfig.json',
        },
        format: 'stylish',
      },
      target: grunt.config('source:es6'),
    },
  });

  grunt.registerMultiTask('eslint', 'Validate files with ESLint', function task() {
    const opts = this.options({
      format: 'stylish',
    });

    if (this.filesSrc.length === 0) {
      grunt.log.writeln(chalk.magenta('Could not find any files to validate.'));
      return true;
    }

    const formatter = eslint.CLIEngine.getFormatter(opts.format);

    if (!formatter) {
      grunt.warn(`Could not find formatter ${opts.format}.`);
      return false;
    }

    const engine = new eslint.CLIEngine(opts);

    let report = null;
    try {
      report = engine.executeOnFiles(this.filesSrc);
    } catch (err) {
      grunt.warn(err);
      return false;
    }

    if (opts.fix) {
      eslint.CLIEngine.outputFixes(report);
    }

    const output = formatter(report.results);

    if (output) {
      console.log(output);
    }

    return report.errorCount === 0;
  });
};
