'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.setEventTransfer = exports.getEventTransfer = exports.getEventRange = exports.findRange = exports.findNode = exports.findDOMRange = exports.findDOMNode = exports.cloneFragment = exports.Editor = undefined;

var _editor = require('./components/editor');

var _editor2 = _interopRequireDefault(_editor);

var _cloneFragment = require('./utils/clone-fragment');

var _cloneFragment2 = _interopRequireDefault(_cloneFragment);

var _findDomNode = require('./utils/find-dom-node');

var _findDomNode2 = _interopRequireDefault(_findDomNode);

var _findDomRange = require('./utils/find-dom-range');

var _findDomRange2 = _interopRequireDefault(_findDomRange);

var _findNode = require('./utils/find-node');

var _findNode2 = _interopRequireDefault(_findNode);

var _findRange = require('./utils/find-range');

var _findRange2 = _interopRequireDefault(_findRange);

var _getEventRange = require('./utils/get-event-range');

var _getEventRange2 = _interopRequireDefault(_getEventRange);

var _getEventTransfer = require('./utils/get-event-transfer');

var _getEventTransfer2 = _interopRequireDefault(_getEventTransfer);

var _setEventTransfer = require('./utils/set-event-transfer');

var _setEventTransfer2 = _interopRequireDefault(_setEventTransfer);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Export.
 *
 * @type {Object}
 */

exports.Editor = _editor2.default;
exports.cloneFragment = _cloneFragment2.default;
exports.findDOMNode = _findDomNode2.default;
exports.findDOMRange = _findDomRange2.default;
exports.findNode = _findNode2.default;
exports.findRange = _findRange2.default;
exports.getEventRange = _getEventRange2.default;
exports.getEventTransfer = _getEventTransfer2.default;
exports.setEventTransfer = _setEventTransfer2.default;
exports.default = {
  Editor: _editor2.default,
  cloneFragment: _cloneFragment2.default,
  findDOMNode: _findDomNode2.default,
  findDOMRange: _findDomRange2.default,
  findNode: _findNode2.default,
  findRange: _findRange2.default,
  getEventRange: _getEventRange2.default,
  getEventTransfer: _getEventTransfer2.default,
  setEventTransfer: _setEventTransfer2.default
};