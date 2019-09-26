/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from 'underscore';
import fs from 'fs-plus';
import path from 'path';

let DefaultResourcePath = null;
import DatabaseObjectRegistry from '../../registries/database-object-registry';

export function waitFor(latch, options: { timeout?: number } = {}) {
  const timeout = options.timeout || 400;
  const expire = Date.now() + timeout;
  return new Promise(function(resolve, reject) {
    var attempt = function() {
      if (Date.now() > expire) {
        return reject(new Error(`Utils.waitFor hit timeout (${timeout}ms) without firing.`));
      }
      if (latch()) {
        return resolve();
      }
      window.requestAnimationFrame(attempt);
    };
    attempt();
  });
}

export function showIconForAttachments(files) {
  if (!(files instanceof Array)) {
    return false;
  }
  // TODO BG: This code has been duplicated into the mailsync core. The
  // Thread.attachmentCount property is now the number of attachments that
  // meet these two criteria so this function can be removed soon.
  return files.find(f => !f.contentId || f.size > 12 * 1024);
}

export function extractTextFromHtml(html, param: { maxLength?: number } = {}) {
  const { maxLength } = param;
  if ((html != null ? html : '').trim().length === 0) {
    return '';
  }
  if (maxLength && html.length > maxLength) {
    html = html.slice(0, maxLength);
  }
  return new DOMParser().parseFromString(html, 'text/html').body.innerText;
}

export function modelTypesReviver(k, v) {
  const type = v != null ? v.__cls : undefined;
  if (!type) {
    return v;
  }

  if (DatabaseObjectRegistry.isInRegistry(type)) {
    return DatabaseObjectRegistry.deserialize(type, v);
  }

  return v;
}

export function convertToModel(json) {
  if (!json) {
    return null;
  }
  if (!json.__cls) {
    throw new Error('convertToModel: no __cls found on object.');
  }
  if (!DatabaseObjectRegistry.isInRegistry(json.__cls)) {
    throw new Error('convertToModel: __cls is not a known class.');
  }
  return DatabaseObjectRegistry.deserialize(json.__cls, json);
}

export function fastOmit(props, without) {
  const otherProps = Object.assign({}, props);
  for (let w of without) {
    delete otherProps[w];
  }
  return otherProps;
}

export function isHash(object) {
  return _.isObject(object) && !_.isFunction(object) && !_.isArray(object);
}

export function escapeRegExp(str) {
  return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

export function range(left, right, inclusive = true) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}

// Generates a new RegExp that is great for basic search fields. It
// checks if the test string is at the start of words
//
// See regex explanation and test here:
// https://regex101.com/r/zG7aW4/2
export function wordSearchRegExp(str = '') {
  return new RegExp(`((?:^|\\W|$)${escapeRegExp(str.trim())})`, 'ig');
}

// Takes an optional customizer. The customizer is passed the key and the
// new cloned value for that key. The customizer is expected to either
// modify the value and return it or simply be the identity function.
export function deepClone(object, customizer?, stackSeen = [], stackRefs = []) {
  let newObject;
  if (!_.isObject(object)) {
    return object;
  }
  if (_.isFunction(object)) {
    return object;
  }

  if (_.isArray(object)) {
    // http://perfectionkills.com/how-ecmascript-5-still-does-not-allow-to-subclass-an-array/
    newObject = [];
  } else if (object instanceof Date) {
    // You can't clone dates by iterating through `getOwnPropertyNames`
    // of the Date object. We need to special-case Dates.
    newObject = new Date(object);
  } else {
    newObject = Object.create(Object.getPrototypeOf(object));
  }

  // Circular reference check
  const seenIndex = stackSeen.indexOf(object);
  if (seenIndex >= 0) {
    return stackRefs[seenIndex];
  }
  stackSeen.push(object);
  stackRefs.push(newObject);

  // It's important to use getOwnPropertyNames instead of Object.keys to
  // get the non-enumerable items as well.
  for (let key of Object.getOwnPropertyNames(object)) {
    const newVal = deepClone(object[key], customizer, stackSeen, stackRefs);
    if (_.isFunction(customizer)) {
      newObject[key] = customizer(key, newVal);
    } else {
      newObject[key] = newVal;
    }
  }
  return newObject;
}

export function toSet(arr = []) {
  const set = {};
  for (let item of arr) {
    set[item] = true;
  }
  return set;
}

// Given a File object or uploadData of an uploading file object,
// determine if it looks like an image and is in the size range for previews
export function shouldDisplayAsImage(
  file: {
    filename?: string;
    fileName?: string;
    name?: string;
    size?: number;
    fileSize?: number;
  } = {}
) {
  const name = file.filename || file.fileName || file.name || '';
  const size = file.size || file.fileSize || 0;
  const ext = path.extname(name).toLowerCase();
  const extensions = ['.jpg', '.bmp', '.gif', '.png', '.jpeg'];

  return extensions.includes(ext) && size > 512 && size < 1024 * 1024 * 5;
}

// Escapes potentially dangerous html characters
// This code is lifted from Angular.js
// See their specs here:
// https://github.com/angular/angular.js/blob/master/test/ngSanitize/sanitizeSpec.js
// And the original source here: https://github.com/angular/angular.js/blob/master/src/ngSanitize/sanitize.js#L451
export function encodeHTMLEntities(value) {
  const SURROGATE_PAIR_REGEXP = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  const pairFix = function(value) {
    const hi = value.charCodeAt(0);
    const low = value.charCodeAt(1);
    return `&#${(hi - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000};`;
  };

  // Match everything outside of normal chars and " (quote character)
  const NON_ALPHANUMERIC_REGEXP = /([^#-~| |!])/g;
  const alphaFix = value => `&#${value.charCodeAt(0)};`;

  return value
    .replace(/&/g, '&amp;')
    .replace(SURROGATE_PAIR_REGEXP, pairFix)
    .replace(NON_ALPHANUMERIC_REGEXP, alphaFix)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function generateTempId() {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `local-${s4()}${s4()}-${s4()}`;
}

export function generateContentId() {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `mcid-${s4()}${s4()}-${s4()}`;
}

export function isTempId(id) {
  if (!id || !_.isString(id)) {
    return false;
  }
  return id.slice(0, 6) === 'local-';
}

let _imageData = null;
let _imageCache = {};

export function imageNamed(fullname, resourcePath?) {
  const [name, ext] = fullname.split('.');

  if (DefaultResourcePath == null) {
    DefaultResourcePath = AppEnv.getLoadSettings().resourcePath;
  }
  if (resourcePath == null) {
    resourcePath = DefaultResourcePath;
  }

  if (!_imageData) {
    _imageData = AppEnv.fileListCache().imageData || '{}';
    _imageCache = JSON.parse(_imageData) || {};
  }

  if (!_imageCache || !_imageCache[resourcePath]) {
    if (_imageCache == null) {
      _imageCache = {};
    }
    if (_imageCache[resourcePath] == null) {
      _imageCache[resourcePath] = {};
    }
    const imagesPath = path.join(resourcePath, 'static', 'images');
    const files = fs.listTreeSync(imagesPath);
    for (let file of files) {
      // On Windows, we get paths like C:\images\compose.png, but
      // Chromium doesn't accept the backward slashes. Convert to
      // C:/images/compose.png
      file = file.replace(/\\/g, '/');
      const basename = path.basename(file);
      _imageCache[resourcePath][basename] = file;
    }
    AppEnv.fileListCache().imageData = JSON.stringify(_imageCache);
  }

  const plat = process.platform != null ? process.platform : '';
  const ratio = window.devicePixelRatio != null ? window.devicePixelRatio : 1;

  let attempt = `${name}-${plat}@${ratio}x.${ext}`;
  if (_imageCache[resourcePath][attempt]) {
    return _imageCache[resourcePath][attempt];
  }
  attempt = `${name}@${ratio}x.${ext}`;
  if (_imageCache[resourcePath][attempt]) {
    return _imageCache[resourcePath][attempt];
  }
  attempt = `${name}-${plat}.${ext}`;
  if (_imageCache[resourcePath][attempt]) {
    return _imageCache[resourcePath][attempt];
  }
  attempt = `${name}.${ext}`;
  if (_imageCache[resourcePath][attempt]) {
    return _imageCache[resourcePath][attempt];
  }
  attempt = `${name}-${plat}@2x.${ext}`;
  if (_imageCache[resourcePath][attempt]) {
    return _imageCache[resourcePath][attempt];
  }
  attempt = `${name}@2x.${ext}`;
  if (_imageCache[resourcePath][attempt]) {
    return _imageCache[resourcePath][attempt];
  }
  attempt = `${name}-${plat}@1x.${ext}`;
  if (_imageCache[resourcePath][attempt]) {
    return _imageCache[resourcePath][attempt];
  }
  attempt = `${name}@1x.${ext}`;
  if (_imageCache[resourcePath][attempt]) {
    return _imageCache[resourcePath][attempt];
  }
  return null;
}

export function subjectWithPrefix(subject, prefix) {
  if (subject.search(/fwd:/i) === 0) {
    return subject.replace(/fwd:/i, prefix);
  } else if (subject.search(/re:/i) === 0) {
    return subject.replace(/re:/i, prefix);
  } else {
    return `${prefix} ${subject}`;
  }
}

// True of all arguments have the same domains
export function emailsHaveSameDomain(...args: string[]) {
  if (args.length < 2) {
    return false;
  }
  const domains = args.map((email = '') => {
    return _.last(
      email
        .toLowerCase()
        .trim()
        .split('@')
    );
  });
  const toMatch = domains[0];
  return _.every(domains, domain => domain.length > 0 && toMatch === domain);
}

export function emailHasCommonDomain(email = '') {
  const domain = _.last(
    email
      .toLowerCase()
      .trim()
      .split('@')
  );
  return commonDomains[domain] != null ? commonDomains[domain] : false;
}

// This looks for and removes plus-ing, it taks a VERY liberal approach
// to match an email address. We'd rather let false positives through.
export function toEquivalentEmailForm(email) {
  // https://regex101.com/r/iS7kD5/3
  // eslint-disable-next-line
  const [ignored, user, domain] = /^([^+]+).*@(.+)$/gi.exec(email) || [null, '', ''];
  return `${user}@${domain}`.trim().toLowerCase();
}

export function emailIsEquivalent(email1, email2) {
  if (email1 == null) {
    email1 = '';
  }
  if (email2 == null) {
    email2 = '';
  }
  email1 = email1.toLowerCase().trim();
  email2 = email2.toLowerCase().trim();
  if (email1 === email2) {
    return true;
  }
  email1 = toEquivalentEmailForm(email1);
  email2 = toEquivalentEmailForm(email2);
  return email1 === email2;
}

export function rectVisibleInRect(r1, r2) {
  return !(r2.left > r1.right || r2.right < r1.left || r2.top > r1.bottom || r2.bottom < r1.top);
}

export function isEqualReact(a, b, options: { ignoreKeys?: []; functionsAreEqual?: boolean } = {}) {
  return isEqual(a, b, {
    functionsAreEqual: true,
    ignoreKeys: (options.ignoreKeys != null ? options.ignoreKeys : []).concat(['id']),
  });
}

// Customized version of Underscore 1.8.2's isEqual function
// You can pass the following options:
//   - functionsAreEqual: if true then all functions are equal
//   - keysToIgnore: an array of object keys to ignore checks on
//   - logWhenFalse: logs when isEqual returns false
export function isEqual(
  a,
  b,
  options: { functionsAreEqual?: boolean; logWhenFalse?: boolean; ignoreKeys?: string[] } = {}
) {
  const value = _isEqual(a, b, [], [], options);
  if (options.logWhenFalse) {
    if (value === false) {
      console.log('isEqual is false', a, b, options);
    }
    return value;
  } else {
  }
  return value;
}

export function _isEqual(
  a,
  b,
  aStack,
  bStack,
  options: { functionsAreEqual?: boolean; ignoreKeys?: string[] } = {}
) {
  // Identical objects are equal. `0 is -0`, but they aren't identical.
  // See the [Harmony `egal`
  // proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
  if (a === b) {
    return a !== 0 || 1 / a === 1 / b;
  }
  // A strict comparison is necessary because `null == undefined`.
  if (a === null || b === null) {
    return a === b;
  }
  // Unwrap any wrapped objects.
  if ((a != null ? a._wrapped : undefined) != null) {
    a = a._wrapped;
  }
  if ((b != null ? b._wrapped : undefined) != null) {
    b = b._wrapped;
  }

  if (options.functionsAreEqual) {
    if (_.isFunction(a) && _.isFunction(b)) {
      return true;
    }
  }

  // Compare `[[Class]]` names.
  const className = toString.call(a);
  if (className !== toString.call(b)) {
    return false;
  }
  switch (className) {
    // Strings, numbers, regular expressions, dates, and booleans are
    // compared by value.
    // RegExps are coerced to strings for comparison (Note: '' + /a/i is '/a/i')
    case '[object RegExp]':
    case '[object String]':
      // Primitives and their corresponding object wrappers are equivalent;
      // thus, `"5"` is equivalent to `new String("5")`.
      return `${a}` === `${b}`;
    case '[object Number]':
      // `NaN`s are equivalent, but non-reflexive.
      // Object(NaN) is equivalent to NaN
      // eslint-disable-next-line
      if (+a !== +a) {
        return +b !== +b; // eslint-disable-line
      }
      // An `egal` comparison is performed for other numeric values.
      if (+a === 0) {
        return 1 / +a === 1 / b;
      } else {
        return +a === +b;
      }
    case '[object Date]':
    case '[object Boolean]':
      // Coerce dates and booleans to numeric primitive values. Dates are
      // compared by their millisecond representations. Note that invalid
      // dates with millisecond representations of `NaN` are not
      // equivalent.
      return +a === +b;
    default:
  }

  const areArrays = className === '[object Array]';
  if (!areArrays) {
    if (typeof a !== 'object' || typeof b !== 'object') {
      return false;
    }

    // Objects with different constructors are not equivalent, but
    // `Object`s or `Array`s from different frames are.
    const aCtor = a.constructor;
    const bCtor = b.constructor;
    if (
      aCtor !== bCtor &&
      !(
        _.isFunction(aCtor) &&
        aCtor instanceof aCtor &&
        _.isFunction(bCtor) &&
        bCtor instanceof bCtor
      ) &&
      ('constructor' in a && 'constructor' in b)
    ) {
      return false;
    }
  }
  // Assume equality for cyclic structures. The algorithm for detecting cyclic
  // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

  // Initializing stack of traversed objects.
  // It's done here since we only need them for objects and arrays comparison.
  aStack = aStack != null ? aStack : [];
  bStack = bStack != null ? bStack : [];
  let { length } = aStack;
  while (length--) {
    // Linear search. Performance is inversely proportional to the number of
    // unique nested structures.
    if (aStack[length] === a) {
      return bStack[length] === b;
    }
  }

  // Add the first object to the stack of traversed objects.
  aStack.push(a);
  bStack.push(b);

  // Recursively compare objects and arrays.
  if (areArrays) {
    // Compare array lengths to determine if a deep comparison is necessary.
    ({ length } = a);
    if (length !== b.length) {
      return false;
    }
    // Deep compare the contents, ignoring non-numeric properties.
    while (length--) {
      if (!_isEqual(a[length], b[length], aStack, bStack, options)) {
        return false;
      }
    }
  } else {
    // Deep compare objects.
    let key = undefined;
    const keys = Object.keys(a);
    ({ length } = keys);
    // Ensure that both objects contain the same number of properties
    // before comparing deep equality.
    if (Object.keys(b).length !== length) {
      return false;
    }
    const keysToIgnore = {};
    if (options.ignoreKeys && _.isArray(options.ignoreKeys)) {
      for (key of options.ignoreKeys) {
        keysToIgnore[key] = true;
      }
    }
    while (length--) {
      // Deep compare each member
      key = keys[length];
      if (key in keysToIgnore) {
        continue;
      }
      if (!(_.has(b, key) && _isEqual(a[key], b[key], aStack, bStack, options))) {
        return false;
      }
    }
  }
  // Remove the first object from the stack of traversed objects.
  aStack.pop();
  bStack.pop();
  return true;
}

// https://github.com/mailcheck/mailcheck/wiki/list-of-popular-domains
// As a hash for instant lookup.
export const commonDomains = {
  'aol.com': true,
  'att.net': true,
  'comcast.net': true,
  'facebook.com': true,
  'gmail.com': true,
  'gmx.com': true,
  'googlemail.com': true,
  'google.com': true,
  'hotmail.com': true,
  'hotmail.co.uk': true,
  'mac.com': true,
  'me.com': true,
  'mail.com': true,
  'msn.com': true,
  'live.com': true,
  'sbcglobal.net': true,
  'verizon.net': true,
  'yahoo.com': true,
  'yahoo.co.uk': true,
  'email.com': true,
  'games.com': true,
  'gmx.net': true,
  'hush.com': true,
  'hushmail.com': true,
  'inbox.com': true,
  'lavabit.com': true,
  'love.com': true,
  'pobox.com': true,
  'rocketmail.com': true,
  'safe-mail.net': true,
  'wow.com': true,
  'ygm.com': true,
  'ymail.com': true,
  'zoho.com': true,
  'fastmail.fm': true,
  'bellsouth.net': true,
  'charter.net': true,
  'cox.net': true,
  'earthlink.net': true,
  'juno.com': true,
  'btinternet.com': true,
  'virginmedia.com': true,
  'blueyonder.co.uk': true,
  'freeserve.co.uk': true,
  'live.co.uk': true,
  'ntlworld.com': true,
  'o2.co.uk': true,
  'orange.net': true,
  'sky.com': true,
  'talktalk.co.uk': true,
  'tiscali.co.uk': true,
  'virgin.net': true,
  'wanadoo.co.uk': true,
  'bt.com': true,
  'sina.com': true,
  'qq.com': true,
  'naver.com': true,
  'hanmail.net': true,
  'daum.net': true,
  'nate.com': true,
  'yahoo.co.jp': true,
  'yahoo.co.kr': true,
  'yahoo.co.id': true,
  'yahoo.co.in': true,
  'yahoo.com.sg': true,
  'yahoo.com.ph': true,
  'hotmail.fr': true,
  'live.fr': true,
  'laposte.net': true,
  'yahoo.fr': true,
  'wanadoo.fr': true,
  'orange.fr': true,
  'gmx.fr': true,
  'sfr.fr': true,
  'neuf.fr': true,
  'free.fr': true,
  'gmx.de': true,
  'hotmail.de': true,
  'live.de': true,
  'online.de': true,
  't-online.de': true,
  'web.de': true,
  'yahoo.de': true,
  'mail.ru': true,
  'rambler.ru': true,
  'yandex.ru': true,
  'hotmail.be': true,
  'live.be': true,
  'skynet.be': true,
  'voo.be': true,
  'tvcablenet.be': true,
  'hotmail.com.ar': true,
  'live.com.ar': true,
  'yahoo.com.ar': true,
  'fibertel.com.ar': true,
  'speedy.com.ar': true,
  'arnet.com.ar': true,
  'yahoo.com.mx': true,
  'live.com.mx': true,
  'hotmail.es': true,
  'hotmail.com.mx': true,
  'prodigy.net.mx': true,
};

export const commonlyCapitalizedSalutations = [
  'grandpa',
  'grandfather',
  'gramps',
  'grampa',
  'grandaddy',
  'grandad',
  'granda',
  'grandma',
  'grandmother',
  'grandson',
  'granddaughter',
  'grandchild',
  'grandchildren',
  'appa',
  'pop',
  'papa',
  'tata',
  'issi',
  'anna',
  'amma',
  'nana',
  'granny',
  'grandmom',
  'nan',
  'nanny',
  'memaw',
  'aunt',
  'uncle',
  'aunts',
  'uncles',
  'ma',
  'mom',
  'mother',
  'dad',
  'father',
  'pa',
  'bud',
  'buds',
  'kid',
  'kids',
  'niece',
  'sister',
  'brother',
  'brothers',
  'nephew',
  'nephews',
  "y'all",
  'yall',
  'yinz',
  'yinzers',
  'cousin',
  'cousins',
  'parents',
  'man',
  'men',
  'dude',
  'bro',
  'buddy',
  'women',
  'girl',
  'girls',
  'son',
  'sons',
  'guy',
  'guys',
  'lady',
  'ladies',
];

export function hueForString(str: string | null) {
  if (!str) {
    str = '';
  }
  return (
    str
      .split('')
      .map(c => c.charCodeAt(0))
      .reduce((n, a) => n + a, 0) % 360
  );
}

// Emails that nave no-reply or similar phrases in them are likely not a
// human. As such it's not worth the cost to do a lookup on that person.
//
// Also emails that are really long are likely computer-generated email
// strings used for bcc-based automated teasks.
export function likelyNonHumanEmail(email) {
  // simple catch for long emails that are almost always autoreplies
  if (email.length > 48) {
    return true;
  }

  // simple catch for things like hex sequences in prefixes
  const digitCount =
    email
      .split('@')
      .shift()
      .split(/[0-9]/g).length - 1;
  if (digitCount >= 6) {
    return true;
  }

  // more advanced scan for common patterns
  const at = '[-@+=]';
  const terms = [
    'no[-_]?reply',
    'do[-_]?not[-_]?reply',
    `bounce[s]?${at}`,
    'postmaster',
    `notification[s]?${at}`,
    `jobs${at}`,
    `developer${at}`,
    `receipts${at}`,
    `support${at}`,
    `billing${at}`,
    `ebill${at}`,
    `hello${at}`,
    `customercare${at}`,
    `contact${at}`,
    `team${at}`,
    `status${at}`,
    `alert[s]?${at}`,
    'notify',
    'auto[-_]confirm',
    'invitations',
    'newsletter',
    `[-_]tracking${at}`,
    'reply[-_]',
    'room[-_]',
    `[-_]reply${at}`,
    `email${at}`,
    `welcome${at}`,
    `news${at}`,
    `info${at}`,
    `automated${at}`,
    `list[s]?${at}`,
    `distribute[s]?${at}`,
    `catchall${at}`,
    `catch[-_]all${at}`,
  ];
  const reStr = `(${terms.join('|')})`;
  const re = new RegExp(reStr, 'gi');
  return re.test(email);
}

// Does the several tests you need to determine if a test range is within
// a bounds. Expects both objects to have `start` and `end` keys.
// Compares any values with <= and >=.
export function overlapsBounds(bounds, test) {
  // Fully enclosed
  return (
    (test.start <= bounds.end && test.end >= bounds.start) ||
    // Starts in bounds. Ends out of bounds
    (test.start <= bounds.end && test.start >= bounds.start) ||
    // Ends in bounds. Starts out of bounds
    (test.end >= bounds.start && test.end <= bounds.end) ||
    // Spans entire boundary
    (test.end >= bounds.end && test.start <= bounds.start)
  );
}
