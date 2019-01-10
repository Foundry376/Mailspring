'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slateBase64Serializer = require('slate-base64-serializer');

var _slateBase64Serializer2 = _interopRequireDefault(_slateBase64Serializer);

var _findDomNode = require('./find-dom-node');

var _findDomNode2 = _interopRequireDefault(_findDomNode);

var _getWindow = require('get-window');

var _getWindow2 = _interopRequireDefault(_getWindow);

var _environment = require('../constants/environment');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Prepares a Slate document fragment to be copied to the clipboard.
 *
 * @param {Event} event
 * @param {Value} value
 * @param {Document} [fragment]
 */

function cloneFragment(event, value) {
  var fragment = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : value.fragment;

  var window = (0, _getWindow2.default)(event.target);
  var native = window.getSelection();
  var startKey = value.startKey,
      endKey = value.endKey,
      startText = value.startText,
      endBlock = value.endBlock,
      endInline = value.endInline;

  var isVoidBlock = endBlock && endBlock.isVoid;
  var isVoidInline = endInline && endInline.isVoid;
  var isVoid = isVoidBlock || isVoidInline;

  // If the selection is collapsed, and it isn't inside a void node, abort.
  if (native.isCollapsed && !isVoid) return;

  // Create a fake selection so that we can add a Base64-encoded copy of the
  // fragment to the HTML, to decode on future pastes.
  var encoded = _slateBase64Serializer2.default.serializeNode(fragment);
  var range = native.getRangeAt(0);
  var contents = range.cloneContents();
  var attach = contents.childNodes[0];

  // If the end node is a void node, we need to move the end of the range from
  // the void node's spacer span, to the end of the void node's content.
  if (isVoid) {
    var _r = range.cloneRange();
    var n = isVoidBlock ? endBlock : endInline;
    var node = (0, _findDomNode2.default)(n, window);
    _r.setEndAfter(node);
    contents = _r.cloneContents();
    attach = contents.childNodes[contents.childNodes.length - 1].firstChild;
  }

  // COMPAT: in Safari and Chrome when selecting a single marked word,
  // marks are not preserved when copying.
  // If the attatched is not void, and the startKey and endKey is the same,
  // check if there is marks involved. If so, set the range start just before the
  // startText node
  if ((_environment.IS_CHROME || _environment.IS_SAFARI) && !isVoid && startKey === endKey) {
    var hasMarks = startText.characters.slice(value.selection.anchorOffset, value.selection.focusOffset).filter(function (char) {
      return char.marks.size !== 0;
    }).size !== 0;
    if (hasMarks) {
      var _r2 = range.cloneRange();
      var _node = (0, _findDomNode2.default)(startText, window);
      _r2.setStartBefore(_node);
      contents = _r2.cloneContents();
      attach = contents.childNodes[contents.childNodes.length - 1].firstChild;
    }
  }

  // Remove any zero-width space spans from the cloned DOM so that they don't
  // show up elsewhere when pasted.
  var zws = [].slice.call(contents.querySelectorAll('[data-slate-zero-width]'));
  zws.forEach(function (zw) {
    return zw.parentNode.removeChild(zw);
  });

  // COMPAT: In Chrome and Safari, if the last element in the selection to
  // copy has `contenteditable="false"` the copy will fail, and nothing will
  // be put in the clipboard. So we remove them all. (2017/05/04)
  if (_environment.IS_CHROME || _environment.IS_SAFARI) {
    var els = [].slice.call(contents.querySelectorAll('[contenteditable="false"]'));
    els.forEach(function (el) {
      return el.removeAttribute('contenteditable');
    });
  }

  // Set a `data-slate-fragment` attribute on a non-empty node, so it shows up
  // in the HTML, and can be used for intra-Slate pasting. If it's a text
  // node, wrap it in a `<span>` so we have something to set an attribute on.
  if (attach.nodeType == 3) {
    var span = window.document.createElement('span');

    // COMPAT: In Chrome and Safari, if we don't add the `white-space` style
    // then leading and trailing spaces will be ignored. (2017/09/21)
    span.style.whiteSpace = 'pre';

    span.appendChild(attach);
    contents.appendChild(span);
    attach = span;
  }

  attach.setAttribute('data-slate-fragment', encoded);

  // Add the phony content to the DOM, and select it, so it will be copied.
  var body = window.document.querySelector('body');
  var div = window.document.createElement('div');
  div.setAttribute('contenteditable', true);
  div.style.position = 'absolute';
  div.style.left = '-9999px';

  // COMPAT: In Firefox, the viewport jumps to find the phony div, so it
  // should be created at the current scroll offset with `style.top`.
  // The box model attributes which can interact with 'top' are also reset.
  div.style.border = '0px';
  div.style.padding = '0px';
  div.style.margin = '0px';
  div.style.top = (window.pageYOffset || window.document.documentElement.scrollTop) + 'px';

  div.appendChild(contents);
  body.appendChild(div);

  // COMPAT: In Firefox, trying to use the terser `native.selectAllChildren`
  // throws an error, so we use the older `range` equivalent. (2016/06/21)
  var r = window.document.createRange();
  r.selectNodeContents(div);
  native.removeAllRanges();
  native.addRange(r);

  // Revert to the previous selection right after copying.
  window.requestAnimationFrame(function () {
    body.removeChild(div);
    native.removeAllRanges();
    native.addRange(range);
  });
}

exports.default = cloneFragment;