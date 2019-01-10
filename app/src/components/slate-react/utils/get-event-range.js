'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _getWindow = require('get-window');

var _getWindow2 = _interopRequireDefault(_getWindow);

var _slate = require('slate');

var _findNode = require('./find-node');

var _findNode2 = _interopRequireDefault(_findNode);

var _findRange = require('./find-range');

var _findRange2 = _interopRequireDefault(_findRange);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Get the target range from a DOM `event`.
 *
 * @param {Event} event
 * @param {Value} value
 * @return {Range}
 */

function getEventRange(event, value) {
  if (event.nativeEvent) {
    event = event.nativeEvent;
  }

  var _event = event,
      x = _event.x,
      y = _event.y,
      target = _event.target;

  if (x == null || y == null) return null;

  var document = value.document;

  var node = (0, _findNode2.default)(target, value);
  if (!node) return null;

  // If the drop target is inside a void node, move it into either the next or
  // previous node, depending on which side the `x` and `y` coordinates are
  // closest to.
  if (node.isVoid) {
    var rect = target.getBoundingClientRect();
    var isPrevious = node.object == 'inline' ? x - rect.left < rect.left + rect.width - x : y - rect.top < rect.top + rect.height - y;

    var text = node.getFirstText();
    var _range = _slate.Range.create();
    return isPrevious ? _range.moveToEndOf(document.getPreviousText(text.key)) : _range.moveToStartOf(document.getNextText(text.key));
  }

  // Else resolve a range from the caret position where the drop occured.
  var window = (0, _getWindow2.default)(target);
  var native = void 0;

  // COMPAT: In Firefox, `caretRangeFromPoint` doesn't exist. (2016/07/25)
  if (window.document.caretRangeFromPoint) {
    native = window.document.caretRangeFromPoint(x, y);
  } else {
    var position = window.document.caretPositionFromPoint(x, y);
    native = window.document.createRange();
    native.setStart(position.offsetNode, position.offset);
    native.setEnd(position.offsetNode, position.offset);
  }

  // Resolve a Slate range from the DOM range.
  var range = (0, _findRange2.default)(native, value);
  if (!range) return null;

  return range;
}

/**
 * Export.
 *
 * @type {Function}
 */

exports.default = getEventRange;