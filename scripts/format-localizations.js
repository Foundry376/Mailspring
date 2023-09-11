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
		} else if (p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.ts') || p.endsWith('.tsx')) {
			files.push(p);
		}
	});
}

function writeTerms(terms, destPath) {
	const ordered = {};
	Object.keys(terms)
		.sort()
		.forEach(function (key) {
			ordered[key] = terms[key];
		});
	fs.writeFileSync(destPath, JSON.stringify(ordered, null, 2));
}

collectFiles(__dirname + '/../app/src');
collectFiles(__dirname + '/../app/internal_packages');
collectFiles(__dirname + '/../app/menus');

let sourceTerms = [];
let found = 0;

files.forEach((file) => {
	const file_content = fs.readFileSync(file).toString();
	const match = /localized(?:ReactFragment)?\([\n\t\s]*['`"](.*?)['`"][\n\t\s]*(?:\,|\)(?!['`"]))/gs;
	const localized_matches = file_content.matchAll(match);

	if (localized_matches) {
		for (const localized_match of localized_matches) {
			let localized_string = localized_match[1];
			// Replace concatenation of strings to a single string
			localized_string = localized_string.replace(/['`"][\s\n]*\+[\s\n]*['`"]/g, '').replace(/\s+/g, ' ');

			// Replace "\n" in the string with an actual \n, simulating what JS would do
			// when evaluating it in quotes. (legacy)
			localized_string = localized_string.replace(/\\n/g, '\n').replace(/\\r/g, '\r');

			// add to sourceTerms
			sourceTerms[localized_string] = localized_string;

			found += 1;
		}
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