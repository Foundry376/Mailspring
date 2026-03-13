/**
 * Injects the current git commit hash into app/package.json before packaging.
 * The placeholder COMMIT_INSERTED_DURING_PACKAGING is replaced with the
 * short (8-char) commit hash.
 *
 * This script is idempotent — if the placeholder is not found (e.g., already
 * injected), it logs a warning and exits cleanly.
 *
 * Usage: node scripts/inject-commit-hash.js
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const packageJsonPath = path.resolve(__dirname, '..', 'app', 'package.json');
const commit = execSync('git rev-parse HEAD').toString().trim().substr(0, 8);

let content = fs.readFileSync(packageJsonPath, 'utf8');

if (content.includes('COMMIT_INSERTED_DURING_PACKAGING')) {
  content = content.replace('COMMIT_INSERTED_DURING_PACKAGING', commit);
  fs.writeFileSync(packageJsonPath, content);
  console.log(`Injected commit hash ${commit} into app/package.json`);
} else {
  console.warn('Warning: COMMIT_INSERTED_DURING_PACKAGING placeholder not found in app/package.json');
  console.warn('The commit hash may have already been injected.');
}
