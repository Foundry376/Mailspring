'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _findDomPoint = require('./find-dom-point');

var _findDomPoint2 = _interopRequireDefault(_findDomPoint);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Find a native DOM range Slate `range`.
 *
 * @param {Range} range
 * @param {Window} win (optional)
 * @return {Object|Null}
 */

function findDOMRange(range) {
  var win = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : window;
  var anchorKey = range.anchorKey,
      anchorOffset = range.anchorOffset,
      focusKey = range.focusKey,
      focusOffset = range.focusOffset,
      isBackward = range.isBackward,
      isCollapsed = range.isCollapsed;

  var anchor = (0, _findDomPoint2.default)(anchorKey, anchorOffset, win);
  var focus = isCollapsed ? anchor : (0, _findDomPoint2.default)(focusKey, focusOffset, win);
  if (!anchor || !focus) return null;

  var r = win.document.createRange();
  var start = isBackward ? focus : anchor;
  var end = isBackward ? anchor : focus;
  r.setStart(start.node, start.offset);
  r.setEnd(end.node, end.offset);
  return r;
}

/**
 * Export.
 *
 * @type {Function}
 */

exports.default = findDOMRange;