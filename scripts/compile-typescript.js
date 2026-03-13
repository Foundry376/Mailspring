/**
 * Compiles all TypeScript/TSX/JSX source files in the app directory to JavaScript.
 * Used as a pre-build step before electron-builder packages the app.
 *
 * This replaces the `runTranspilers` afterCopy hook from the old Grunt/packager pipeline.
 * It transpiles files in-place so electron-builder can pick them up directly.
 */
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const TypeScript = require('typescript');

const appDir = path.resolve(__dirname, '..', 'app');
const { compilerOptions } = require(path.join(appDir, 'tsconfig.json'));

const patterns = [
  'internal_packages/**/*.ts',
  'internal_packages/**/*.tsx',
  'internal_packages/**/*.jsx',
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.jsx',
];

const excludePatterns = [
  '**/node_modules/**',
];

let compiled = 0;
let skipped = 0;

for (const pattern of patterns) {
  const files = glob.sync(pattern, { cwd: appDir, ignore: excludePatterns });
  for (const relPath of files) {
    const tsPath = path.join(appDir, relPath);

    // Skip .js files that matched and declaration files
    if (tsPath.endsWith('.d.ts')) {
      skipped++;
      continue;
    }

    const tsCode = fs.readFileSync(tsPath, 'utf8');
    const outPath = tsPath.replace(path.extname(tsPath), '.js');

    const res = TypeScript.transpileModule(tsCode, { compilerOptions, fileName: tsPath });
    fs.writeFileSync(outPath, res.outputText);
    fs.unlinkSync(tsPath);
    compiled++;
  }
}

console.log(`Compiled ${compiled} TypeScript files (skipped ${skipped} declaration files)`);
