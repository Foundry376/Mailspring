const fs = require('fs');
const path = require('path');

let files = [];

const PATH_TO_LANG = __dirname + '/../app/lang';
const PATH_TO_ENGLISH = `${PATH_TO_LANG}/en.json`;

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

function writeTerms(terms, destPath) {
  const ordered = {};
  Object.keys(terms)
    .sort()
    .forEach(function(key) {
      ordered[key] = terms[key];
    });
  fs.writeFileSync(destPath, JSON.stringify(ordered, null, 2));
}

collectFiles(__dirname + '/../app/src');
collectFiles(__dirname + '/../app/internal_packages');
collectFiles(__dirname + '/../app/menus');

let sourceTerms = [];
let found = 0;

const start = /localized(?:ReactFragment)?\((['`"]{1})/g;

files.forEach(file => {
  let js = fs.readFileSync(file).toString();
  js = js.replace(/ *\n */g, '');

  let match = null;
  while ((match = start.exec(js))) {
    const paren = match[1];
    const startIndex = match.index + match[0].length;
    const end = new RegExp(`[^\\${paren}]${paren}`);
    const endIndex = end.exec(js.substr(startIndex)).index + startIndex + 1;
    let base = js.substr(startIndex, endIndex - startIndex);

    // Replace "\n" in the string with an actual \n, simulating what JS would do
    // when evaluating it in quotes.
    base = base.replace(/\\n/g, '\n').replace(/\\r/g, '\r');

    found += 1;
    sourceTerms[base] = base;
  }
});

console.log('\nUpdating en.json to match strings in source:');
console.log(`- ${found} localized() calls, ${Object.keys(sourceTerms).length} strings`);
writeTerms(sourceTerms, PATH_TO_ENGLISH);

// Open other localization files, remove unneeded entries
// and summarize localization progress

console.log('\nPruning localized strings files:');
console.log('\nLang\t\tStrings\t\t\tPercent');
console.log('------------------------------------------------');
fs.readdirSync(PATH_TO_LANG).forEach(filename => {
  if (!filename.endsWith('.json')) return;
  const localePath = path.join(PATH_TO_LANG, filename);
  const localized = JSON.parse(fs.readFileSync(localePath).toString());

  const inuse = {};
  Object.keys(localized).forEach(term => {
    if (sourceTerms[term]) {
      inuse[term] = localized[term];
    }
  });
  writeTerms(inuse, localePath);

  const c = Object.keys(inuse).length;
  const t = Object.keys(sourceTerms).length;
  const lang = path.basename(filename, '.json');

  console.log(
    `- ${lang}\t${lang.length < 6 ? '\t' : ''}${c}\t/ ${t}\t\t${Math.round(c / t * 100)}%`
  );
});
