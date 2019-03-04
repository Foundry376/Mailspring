const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const typescriptCompiler = require('./compile-support/typescript');

const COMPILERS = {
  '.jsx': typescriptCompiler,
  '.ts': typescriptCompiler,
  '.tsx': typescriptCompiler,
  '.es6': typescriptCompiler,
};

const cacheStats = {};
let cacheDirectory = null;

function readCachedJavascript(relativeCachePath) {
  const cachePath = path.join(cacheDirectory, relativeCachePath);
  try {
    return fs.readFileSync(cachePath, 'utf8');
  } catch (error) {
    //
  }
  return null;
}

function writeCachedJavascript(relativeCachePath, code) {
  const cacheTmpPath = path.join(cacheDirectory, `${relativeCachePath}.${process.pid}`);
  const cachePath = path.join(cacheDirectory, relativeCachePath);
  mkdirp.sync(path.dirname(cacheTmpPath));
  fs.writeFileSync(cacheTmpPath, code, 'utf8');
  fs.renameSync(cacheTmpPath, cachePath);
}

function addSourceURL(jsCode, filePath) {
  let finalPath = filePath;
  if (process.platform === 'win32') {
    finalPath = `/${path.resolve(filePath).replace(/\\/g, '/')}`;
  }
  return `${jsCode}\n//# sourceURL=${encodeURI(finalPath)}\n`;
}

function compileFileAtPath(compiler, filePath, extension) {
  const sourceCode = fs.readFileSync(filePath, 'utf8');
  if (compiler.shouldCompile(sourceCode, filePath)) {
    const cachePath = compiler.getCachePath(sourceCode, filePath);
    let compiledCode = readCachedJavascript(cachePath);
    if (compiledCode != null) {
      cacheStats[extension].hits++;
    } else {
      cacheStats[extension].misses++;
      compiledCode = addSourceURL(compiler.compile(sourceCode, filePath), filePath);
      writeCachedJavascript(cachePath, compiledCode);
    }
    return compiledCode;
  }
  return sourceCode;
}

const INLINE_SOURCE_MAP_REGEXP = /\/\/[#@]\s*sourceMappingURL=([^'"\n]+)\s*$/gm;

require('source-map-support').install({
  handleUncaughtExceptions: false,

  // Most of this logic is the same as the default implementation in the
  // source-map-support module, but we've overridden it to read the javascript
  // code from our cache directory.
  retrieveSourceMap: filePath => {
    if (!cacheDirectory) {
      return null;
    }

    // read the original source
    let sourceCode = null;
    try {
      sourceCode = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (fs.existsSync(filePath)) {
        console.warn('Error reading source file', error.stack);
      }
      return null;
    }

    // retrieve the javascript for the original source
    const compiler = COMPILERS[path.extname(filePath)];
    let javascriptCode = null;
    if (compiler) {
      try {
        javascriptCode = readCachedJavascript(compiler.getCachePath(sourceCode, filePath));
      } catch (error) {
        console.warn('Error reading compiled file', error.stack);
        return null;
      }
    } else {
      javascriptCode = sourceCode;
    }

    if (javascriptCode == null) {
      return null;
    }

    let match;
    let lastMatch;
    INLINE_SOURCE_MAP_REGEXP.lastIndex = 0;
    while ((match = INLINE_SOURCE_MAP_REGEXP.exec(javascriptCode))) {
      lastMatch = match;
    }
    if (lastMatch == null) {
      return null;
    }

    const sourceMappingURL = lastMatch[1];

    // check whether this is a file path, or an inline sourcemap and load it
    let rawData = null;
    if (sourceMappingURL.includes(',')) {
      rawData = sourceMappingURL.slice(sourceMappingURL.indexOf(',') + 1);
    } else {
      rawData = fs.readFileSync(path.resolve(path.dirname(filePath), sourceMappingURL));
    }

    let sourceMap = null;
    try {
      sourceMap = JSON.parse(Buffer.from(rawData, 'base64'));
    } catch (error) {
      console.warn('Error parsing source map', error.stack);
      return null;
    }

    return {
      map: sourceMap,
      url: null,
    };
  },
});

Object.keys(COMPILERS).forEach(extension => {
  const compiler = COMPILERS[extension];

  Object.defineProperty(require.extensions, extension, {
    enumerable: true,
    writable: true,
    value: (module, filePath) => {
      const code = compileFileAtPath(compiler, filePath, extension);
      return module._compile(code, filePath);
    },
  });
});

exports.setHomeDirectory = nylasHome => {
  let cacheDir = path.join(nylasHome, 'compile-cache');
  if (
    process.env.USER === 'root' &&
    process.env.SUDO_USER &&
    process.env.SUDO_USER !== process.env.USER
  ) {
    cacheDir = path.join(cacheDir, 'root');
  }
  this.setCacheDirectory(cacheDir);
};

exports.setCacheDirectory = directory => {
  cacheDirectory = directory;
};

exports.getCacheDirectory = () => {
  return cacheDirectory;
};

exports.addPathToCache = (filePath, nylasHome) => {
  this.setHomeDirectory(nylasHome);
  const extension = path.extname(filePath);
  const compiler = COMPILERS[extension];
  if (compiler) {
    compileFileAtPath(compiler, filePath, extension);
  }
};

exports.getCacheStats = () => {
  return cacheStats;
};

exports.resetCacheStats = () => {
  Object.keys(COMPILERS).forEach(extension => {
    cacheStats[extension] = {
      hits: 0,
      misses: 0,
    };
  });
};
exports.resetCacheStats();
