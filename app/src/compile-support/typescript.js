'use strict';

var crypto = require('crypto');
var path = require('path');

var TypeScript = null;
var typescriptVersionDir = null;

var compilerOptions = require('../../tsconfig.json').compilerOptions;

exports.shouldCompile = function() {
  return true;
};

exports.getCachePath = function(sourceCode) {
  if (typescriptVersionDir == null) {
    var version = '3.3'; // todo
    typescriptVersionDir = path.join('ts', createVersionAndOptionsDigest(version, compilerOptions));
  }

  return path.join(
    typescriptVersionDir,
    crypto
      .createHash('sha1')
      .update(sourceCode, 'utf8')
      .digest('hex') + '.js'
  );
};

exports.compile = function(sourceCode, filePath) {
  if (!TypeScript) {
    try {
      TypeScript = require('typescript');
    } catch (err) {
      if (err.toString().includes('Cannot find module')) {
        const dialog =
          process.type === 'renderer'
            ? require('electron').remote.dialog
            : require('electron').dialog;
        dialog.showErrorBox(
          `Plugin must be compiled`,
          `Sorry, Mailspring no longer ships with Babel and TypeScript to recompile plugins on the fly. ` +
            `Ask the plugin developer to compile the plugin to vanilla JavaScript as a pre-publish step.` +
            `\n\nFile: ${filePath}`
        );
        TypeScript = 'missing';
      } else {
        throw err;
      }
    }
  }
  if (TypeScript === 'missing') {
    return sourceCode;
  }
  return TypeScript.transpileModule(sourceCode, { compilerOptions, fileName: filePath }).outputText;
};

function createVersionAndOptionsDigest(version, options) {
  return crypto
    .createHash('sha1')
    .update('ts', 'utf8')
    .update('\0', 'utf8')
    .update(version, 'utf8')
    .update('\0', 'utf8')
    .update(JSON.stringify(options), 'utf8')
    .digest('hex');
}
