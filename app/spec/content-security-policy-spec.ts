import fs from 'fs';
import path from 'path';

describe('main window Content Security Policy', () => {
  it('allows local files as media without allowing them as scripts', () => {
    const { resourcePath } = AppEnv.getLoadSettings();
    const indexHtml = fs.readFileSync(path.join(resourcePath, 'static', 'index.html'), 'utf8');
    const browserMain = fs.readFileSync(path.join(resourcePath, 'src', 'browser', 'main.js'), 'utf8');

    for (const policySource of [indexHtml, browserMain]) {
      expect(policySource).toContain('media-src mailspring: file:');
      expect(policySource).not.toContain("script-src 'self' file:");
    }
  });
});
