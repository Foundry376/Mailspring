import fs from 'fs';
import path from 'path';

// intl.ts loads the chosen language file with require(), which throws on invalid JSON while the
// app is starting, before any window opens.
describe('Language files', function () {
  const langsDir = path.join(AppEnv.getLoadSettings().resourcePath, 'lang');
  const files = fs.readdirSync(langsDir).filter((f) => f.endsWith('.json'));

  it('are found', function () {
    expect(files).toContain('lb.json');
  });

  for (const file of files) {
    it(`parses ${file}`, function () {
      expect(() => JSON.parse(fs.readFileSync(path.join(langsDir, file)).toString())).not.toThrow();
    });
  }

  it('translates the Look Up string in Luxembourgish under its English key', function () {
    const lb = JSON.parse(fs.readFileSync(path.join(langsDir, 'lb.json')).toString());
    expect(lb['Look Up “%@”']).toBe('"%@" nosichen');
  });
});
