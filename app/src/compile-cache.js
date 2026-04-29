const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const TypeScript = require('typescript');

const { compilerOptions } = require('../tsconfig.json');
const SUPPORTED_EXTENSIONS = ['.jsx', '.ts', '.tsx', '.es6'];

let cacheDirectory = null;

const optionsDigest = crypto
  .createHash('sha256')
  .update('ts', 'utf8')
  .update('\0', 'utf8')
  .update(TypeScript.version, 'utf8')
  .update('\0', 'utf8')
  .update(JSON.stringify(compilerOptions), 'utf8')
  .digest('hex');

function getCachePath(sourceCode) {
  const sourceDigest = crypto
    .createHash('sha256')
    .update(sourceCode, 'utf8')
    .digest('hex');
  return path.join('ts', optionsDigest, `${sourceDigest}.js`);
}

function readCachedJavascript(relativeCachePath) {
  const cachePath = path.join(cacheDirectory, relativeCachePath);
  try {
    return fs.readFileSync(cachePath, 'utf8');
  } catch (error) {
    return null;
  }
}

function writeCachedJavascript(relativeCachePath, code) {
  const cacheTmpPath = path.join(cacheDirectory, `${relativeCachePath}.${process.pid}`);
  const cachePath = path.join(cacheDirectory, relativeCachePath);
  fs.mkdirSync(path.dirname(cacheTmpPath), { recursive: true });
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

function compileFileAtPath(filePath) {
  const sourceCode = fs.readFileSync(filePath, 'utf8');
  const cachePath = getCachePath(sourceCode);
  let compiledCode = readCachedJavascript(cachePath);
  if (compiledCode == null) {
    const { outputText } = TypeScript.transpileModule(sourceCode, {
      compilerOptions,
      fileName: filePath,
    });
    compiledCode = addSourceURL(outputText, filePath);
    writeCachedJavascript(cachePath, compiledCode);
  }
  return compiledCode;
}

const INLINE_SOURCE_MAP_REGEXP = /\/\/[#@]\s*sourceMappingURL=([^'"\n]+)\s*$/gm;

require('source-map-support').install({
  handleUncaughtExceptions: false,

  // Read the compiled JavaScript for the original source from our cache
  // directory, then extract its source map (inline data URI or external file).
  // For files we don't compile, returning null lets source-map-support fall
  // back to its default lookup.
  retrieveSourceMap: filePath => {
    if (!cacheDirectory || !SUPPORTED_EXTENSIONS.includes(path.extname(filePath))) {
      return null;
    }

    let sourceCode;
    try {
      sourceCode = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (fs.existsSync(filePath)) {
        console.warn('Error reading source file', error.stack);
      }
      return null;
    }

    const javascriptCode = readCachedJavascript(getCachePath(sourceCode));
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
    let sourceMap = null;
    try {
      if (sourceMappingURL.includes(',')) {
        // Inline data URI: content after the comma is base64-encoded JSON
        const rawData = sourceMappingURL.slice(sourceMappingURL.indexOf(',') + 1);
        sourceMap = JSON.parse(Buffer.from(rawData, 'base64'));
      } else {
        // External file reference: content is plain JSON. The map file may
        // not exist on disk (it's stripped from production bundles), in
        // which case we silently fall back to no source mapping.
        const mapPath = path.resolve(path.dirname(filePath), sourceMappingURL);
        sourceMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      }
    } catch (error) {
      return null;
    }

    return { map: sourceMap, url: null };
  },
});

SUPPORTED_EXTENSIONS.forEach(extension => {
  Object.defineProperty(require.extensions, extension, {
    enumerable: true,
    writable: true,
    value: (module, filePath) => {
      return module._compile(compileFileAtPath(filePath), filePath);
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
  cacheDirectory = cacheDir;
};
