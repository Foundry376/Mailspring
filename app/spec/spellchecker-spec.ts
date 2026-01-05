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

  describe('learnWord and unlearnWord', () => {
    it('can learn and unlearn words', () => {
      // These methods interact with the session dictionary
      // They should not throw errors
      expect(() => Spellchecker.learnWord('testword')).not.toThrow();
      expect(() => Spellchecker.unlearnWord('testword')).not.toThrow();
    });
  });
});
