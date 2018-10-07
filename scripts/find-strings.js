const fs = require('fs');
const path = require('path');

let files = [];

function collectFiles(dir) {
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.lstatSync(p).isDirectory()) {
      collectFiles(p);
    } else if (p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.es6')) {
      files.push(p);
    }
  });
}

function writeTerms(keys) {
  const ordered = {};
  Object.keys(keys)
    .sort()
    .forEach(function(key) {
      ordered[key] = keys[key];
    });
  fs.writeFileSync(__dirname + '/../app/lang/en.json', JSON.stringify(ordered, null, 2));
}

collectFiles(__dirname + '/../app/src');
collectFiles(__dirname + '/../app/internal_packages');
collectFiles(__dirname + '/../app/menus');

let keys = [];
let found = 0;

const start = /localized(?:ReactFragment)?\((['`"]{1})/g;

files.forEach(file => {
  let js = fs.readFileSync(file).toString();
  js = js.replace(/ *\n */g, '');

  let match = null;
  while ((match = start.exec(js))) {
    const paren = match[1];
    const startIndex = match.index + match[0].length;
    const end = new RegExp(`[^${paren}]${paren}`);
    const endIndex = end.exec(js.substr(startIndex)).index + startIndex + 1;
    const base = js.substr(startIndex, endIndex - startIndex);

    found += 1;
    keys[base] = base;
  }
});

console.log(`Found strings: ${found} localized() calls, ${Object.keys(keys).length} strings`);

writeTerms(keys);
