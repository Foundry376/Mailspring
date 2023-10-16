const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PATH_TO_LANG = path.resolve(__dirname, '..', 'app', 'lang');

const getLanguage = () => {
	return new Promise(resolve => {
		const interface = readline.createInterface({ input: process.stdin, output: process.stdout });
		interface.question('Improve localization for which language? ', (answer) => {
			interface.close();
			const LANG = answer.toLocaleLowerCase();
			const PATH = `${PATH_TO_LANG}/${LANG}.json`;
			if (!fs.existsSync(PATH)) {
				console.log(`\napp/lang/${path.basename(PATH)} not found!`);
				process.exit();
			}
			resolve(LANG);
		});
	});
};

const questionFormated = () => {
	return new Promise(resolve => {
		const interface = readline.createInterface({ input: process.stdin, output: process.stdout });
		interface.question(
			'Have you run the script "format-localizations.js" before? (y/N) ',
			(answer) => {
				interface.close();
				if (answer.toLocaleLowerCase() !== 'y') {
					console.log('Please run the script before!');
					process.exit();
				}
				resolve();
			}
		);
	});
};

const questionAsk = () => {
	return new Promise((resolve) => {
		const interface = readline.createInterface({ input: process.stdin, output: process.stdout });
		interface.question(
			`
[1] Ask for each key not in localization
[2] Put null for all keys not in localization
> `,
			answer => {
				interface.close();
				resolve(answer.toLocaleLowerCase() !== '2');
			}
		);
	});
};

const questionLocalization = (key, index, length) => {
	return new Promise((resolve, reject) => {
		const stdin = process.stdin;
		stdin.on('data', key => {
			if (key == '\u0003') {
				reject('exit');
			}
		});

		const interface = readline.createInterface({ input: stdin, output: process.stdout });
		interface.question(
			`
${key}
${index + 1}/${length} > `,
			(answer) => {
				interface.close();
				if (answer === '') {
					process.stdout.moveCursor(0, -1);
					console.log(`${index + 1}/${length} > not_added`);
					resolve();
				} else {
					resolve(answer);
				}
			}
		);
	});
};

(async () => {
	await questionFormated();
	const LANG = await getLanguage();
	const ASK = await questionAsk();

	const english = JSON.parse(fs.readFileSync(`${PATH_TO_LANG}/en.json`));
	const localization = JSON.parse(fs.readFileSync(`${PATH_TO_LANG}/${LANG}.json`));
	const notInLocalization = Object.keys(english).filter(key => !localization[key]);

	let nbImproved = 0;

	try {
		for (let i = 0; i < notInLocalization.length; i++) {
			const key = notInLocalization[i];
			if (ASK) {
				const answer = await questionLocalization(key, i, notInLocalization.length).catch(() => {
					throw new Error('exit');
				});

				if (answer !== undefined && answer !== '') {
					localization[key] = answer;
					nbImproved++;
				}
			} else {
				localization[key] = null;
			}
		}
	} catch (e) {
		console.log(e.message);
	}

	const sortedLocalization = {};
	Object.keys(localization)
		.sort()
		.forEach((key) => {
			sortedLocalization[key] = localization[key];
		});

	fs.writeFileSync(`${PATH_TO_LANG}/${LANG}.json`, JSON.stringify(sortedLocalization, null, 2));

	if (ASK) {
		console.log(`\napp/lang/${LANG}.json improved with ${nbImproved} key(s)!`);
	} else {
		console.log(`\nYou need to remplace all null value in app/lang/${LANG}.json!`);
	}
})();