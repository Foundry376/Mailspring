import fs from 'fs';
import path from 'path';
import { Autolink } from '../../src/services/autolinker';

describe('autolink', function autolinkSpec() {
  const fixturesDir = path.join(__dirname, 'autolinker-fixtures');
  fs.readdirSync(fixturesDir)
    .filter(filename => filename.indexOf('-in.html') !== -1)
    .forEach(filename => {
      it(`should properly autolink a variety of email bodies ${filename}`, () => {
        const div = document.createElement('div');
        const inputPath = path.join(fixturesDir, filename);
        const expectedPath = inputPath.replace('-in', '-out');

        const input = fs.readFileSync(inputPath).toString();
        const expected = fs.readFileSync(expectedPath).toString();

        div.innerHTML = input;
        Autolink(div, { async: false, telAggressiveMatch: false });

        expect(div.innerHTML).toEqual(expected);
      });
    });
});
