'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

/**
 * The transfer types that Slate recognizes.
 *
 * @type {Object}
 */

var TRANSFER_TYPES = {
  FRAGMENT: 'application/x-slate-fragment',
  HTML: 'text/html',
  NODE: 'application/x-slate-node',
  RICH: 'text/rtf',
  TEXT: 'text/plain'
};

/**
 * Export.
 *
 * @type {Object}
 */

exports.default = TRANSFER_TYPES;