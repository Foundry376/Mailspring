import _ from 'underscore';
import path from 'path';
import LessCache from 'less-cache';
import rtlcss from 'rtlcss';

import { isRTL } from './intl';

// {LessCache} wrapper used by {ThemeManager} to read stylesheets.
export default class LessCompileCache {
  lessSearchPaths: string[];
  cache: LessCache;

  constructor({ configDirPath, resourcePath, importPaths = [] }) {
    this.lessSearchPaths = [
      path.join(resourcePath, 'static', 'base'),
      path.join(resourcePath, 'static'),
    ];

    this.cache = new LessCache({
      cacheDir: path.join(configDirPath, 'compile-cache', isRTL ? 'less-rtl' : 'less'),
      fallbackDir: path.join(resourcePath, 'less-compile-cache'),
      importPaths: importPaths.concat(this.lessSearchPaths),
      resourcePath: resourcePath,
    });

    // swizzle the LessCache parseLess method to perform rtl conversion
    // on the final CSS, and THEN save the cached result / return the CSS
    if (isRTL) {
      const original = this.cache.parseLess;
      this.cache.parseLess = (filePath, contents) => {
        const { imports, css } = original.call(this.cache, filePath, contents);
        return { imports, css: rtlcss.process(css) };
      };
    }
  }

  // Setting the import paths is a VERY expensive operation (200ms +)
  // because it walks the entire file tree and does a file state for each
  // and every importPath. If we already have the imports, then load it
  // from our backend FileListCache.
  setImportPaths(importPaths = []) {
    const fullImportPaths = importPaths.concat(this.lessSearchPaths);
    if (!_.isEqual(fullImportPaths, this.cache.importPaths)) {
      this.cache.setImportPaths(fullImportPaths);
    }
  }

  read(stylesheetPath) {
    return this.cache.readFileSync(stylesheetPath);
  }

  cssForFile(stylesheetPath, lessContent) {
    return this.cache.cssForFile(stylesheetPath, lessContent);
  }
}
