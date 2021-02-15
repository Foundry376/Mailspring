/* eslint-disable no-var */
/* eslint-disable prefer-rest-params */
const _ = require('underscore');

function splitKeyPath(keyPath) {
  let _i;
  let startIndex = 0;
  const keyPathArray = [];
  if (keyPath == null) {
    return keyPathArray;
  }
  for (let i = (_i = 0); _i < keyPath.length; i = ++_i) {
    const char = keyPath[i];
    if (char === '.' && (i === 0 || keyPath[i - 1] !== '\\')) {
      keyPathArray.push(keyPath.substring(startIndex, i));
      startIndex = i + 1;
    }
  }
  keyPathArray.push(keyPath.substr(startIndex, keyPath.length));
  return keyPathArray;
}

function isPlainObject(value) {
  return _.isObject(value) && !_.isArray(value);
}

export function remove(array, element) {
  const index = array.indexOf(element);
  if (index >= 0) {
    array.splice(index, 1);
  }
  return array;
}

export function deepClone(object) {
  if (_.isArray(object)) {
    return object.map(function(value) {
      return deepClone(value);
    });
  } else if (_.isObject(object) && !_.isFunction(object)) {
    return _.mapObject(object, function(value) {
      return deepClone(value);
    });
  } else {
    return object;
  }
}

export function deepExtend(...args) {
  let result = args[0];
  let i = 0;
  while (++i < args.length) {
    const object = args[i];
    if (isPlainObject(result) && isPlainObject(object)) {
      const _ref = Object.keys(object);
      for (let _i = 0; _i < _ref.length; _i++) {
        const key = _ref[_i];
        result[key] = deepExtend(result[key], object[key]);
      }
    } else {
      result = deepClone(object);
    }
  }
  return result;
}

export function valueForKeyPath(object, keyPath) {
  const keys = splitKeyPath(keyPath);
  for (let _i = 0; _i < keys.length; _i++) {
    const key = keys[_i];
    object = object[key];
    if (object == null) {
      return;
    }
  }
  return object;
}

export function setValueForKeyPath(object, keyPath, value) {
  const keys = splitKeyPath(keyPath);
  while (keys.length > 1) {
    const key = keys.shift();
    if (object[key] == null) {
      object[key] = {};
    }
    object = object[key];
  }
  if (value != null) {
    return (object[keys.shift()] = value);
  } else {
    return delete object[keys.shift()];
  }
}
