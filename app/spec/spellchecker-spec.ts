/* eslint global-require: 0 */
import fs from 'fs';
import { Spellchecker } from 'mailspring-exports';

describe('Spellchecker', function spellcheckerTests() {
  beforeEach(() => {
    this.customDict = '{}';
    spyOn(fs, 'writeFile').andCallFake((path, customDict, cb) => {
      this.customDict = customDict;
      cb();
    });
    spyOn(fs, 'readFile').andCallFake((path, cb) => {
      cb(null, this.customDict);
    });
  });

  it('does not call spellchecker when word has already been learned', () => {
    Spellchecker.learnWord('mispaelled');
    const misspelled = Spellchecker.isMisspelled('mispaelled');
    expect(misspelled).toBe(false);
  });

  describe('when a custom word is added', () => {
    this.customWord = 'becaause';

    beforeEach(() => {
      expect(Spellchecker.isMisspelled(this.customWord)).toEqual(true);
      Spellchecker.learnWord(this.customWord);
    });

    afterEach(() => {
      Spellchecker.unlearnWord(this.customWord);
      expect(Spellchecker.isMisspelled(this.customWord)).toEqual(true);
    });

    it("doesn't think it's misspelled", () => {
      expect(Spellchecker.isMisspelled(this.customWord)).toEqual(false);
    });

    it('maintains it across instances', () => {
      const Spellchecker2 = require('../src/spellchecker').default;
      expect(Spellchecker2.isMisspelled(this.customWord)).toEqual(false);
    });
  });
});
