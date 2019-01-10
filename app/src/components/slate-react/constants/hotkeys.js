'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _isHotkey = require('../is-hotkey');

var _environment = require('./environment');

/**
 * Is Apple?
 *
 * @type {Boolean}
 */

var IS_APPLE = _environment.IS_IOS || _environment.IS_MAC;

/**
 * Hotkeys.
 *
 * @type {Function}
 */

var BOLD = (0, _isHotkey.isKeyHotkey)('mod+b');
var ITALIC = (0, _isHotkey.isKeyHotkey)('mod+i');

var ENTER = (0, _isHotkey.isKeyHotkey)('enter');
var SHIFT_ENTER = (0, _isHotkey.isKeyHotkey)('shift+enter');
var SPLIT_BLOCK = function SPLIT_BLOCK(e) {
  return ENTER(e) || SHIFT_ENTER(e);
};

var BACKSPACE = (0, _isHotkey.isKeyHotkey)('backspace');
var SHIFT_BACKSPACE = (0, _isHotkey.isKeyHotkey)('shift+backspace');
var DELETE = (0, _isHotkey.isKeyHotkey)('delete');
var SHIFT_DELETE = (0, _isHotkey.isKeyHotkey)('shift+delete');
var DELETE_BACKWARD = function DELETE_BACKWARD(e) {
  return BACKSPACE(e) || SHIFT_BACKSPACE(e);
};
var DELETE_FORWARD = function DELETE_FORWARD(e) {
  return DELETE(e) || SHIFT_DELETE(e);
};

var DELETE_CHAR_BACKWARD_MAC = (0, _isHotkey.isKeyHotkey)('ctrl+h');
var DELETE_CHAR_FORWARD_MAC = (0, _isHotkey.isKeyHotkey)('ctrl+d');
var DELETE_CHAR_BACKWARD = function DELETE_CHAR_BACKWARD(e) {
  return DELETE_BACKWARD(e) || IS_APPLE && DELETE_CHAR_BACKWARD_MAC(e);
};
var DELETE_CHAR_FORWARD = function DELETE_CHAR_FORWARD(e) {
  return DELETE_FORWARD(e) || IS_APPLE && DELETE_CHAR_FORWARD_MAC(e);
};

var DELETE_LINE_BACKWARD_MAC = (0, _isHotkey.isKeyHotkey)('cmd+backspace');
var DELETE_LINE_FORWARD_MAC = (0, _isHotkey.isKeyHotkey)('ctrl+k');
var DELETE_LINE_BACKWARD = function DELETE_LINE_BACKWARD(e) {
  return IS_APPLE && DELETE_LINE_BACKWARD_MAC(e);
};
var DELETE_LINE_FORWARD = function DELETE_LINE_FORWARD(e) {
  return IS_APPLE && DELETE_LINE_FORWARD_MAC(e);
};

var DELETE_WORD_BACKWARD_MAC = (0, _isHotkey.isKeyHotkey)('option+backspace');
var DELETE_WORD_BACKWARD_PC = (0, _isHotkey.isKeyHotkey)('ctrl+backspace');
var DELETE_WORD_FORWARD_MAC = (0, _isHotkey.isKeyHotkey)('option+delete');
var DELETE_WORD_FORWARD_PC = (0, _isHotkey.isKeyHotkey)('ctrl+delete');
var DELETE_WORD_BACKWARD = function DELETE_WORD_BACKWARD(e) {
  return IS_APPLE ? DELETE_WORD_BACKWARD_MAC(e) : DELETE_WORD_BACKWARD_PC(e);
};
var DELETE_WORD_FORWARD = function DELETE_WORD_FORWARD(e) {
  return IS_APPLE ? DELETE_WORD_FORWARD_MAC(e) : DELETE_WORD_FORWARD_PC(e);
};

var COLLAPSE_CHAR_FORWARD = (0, _isHotkey.isKeyHotkey)('right');
var COLLAPSE_CHAR_BACKWARD = (0, _isHotkey.isKeyHotkey)('left');

var COLLAPSE_LINE_BACKWARD_MAC = (0, _isHotkey.isKeyHotkey)('option+up');
var COLLAPSE_LINE_FORWARD_MAC = (0, _isHotkey.isKeyHotkey)('option+down');
var COLLAPSE_LINE_BACKWARD = function COLLAPSE_LINE_BACKWARD(e) {
  return IS_APPLE && COLLAPSE_LINE_BACKWARD_MAC(e);
};
var COLLAPSE_LINE_FORWARD = function COLLAPSE_LINE_FORWARD(e) {
  return IS_APPLE && COLLAPSE_LINE_FORWARD_MAC(e);
};

var EXTEND_CHAR_FORWARD = (0, _isHotkey.isKeyHotkey)('shift+right');
var EXTEND_CHAR_BACKWARD = (0, _isHotkey.isKeyHotkey)('shift+left');

var EXTEND_LINE_BACKWARD_MAC = (0, _isHotkey.isKeyHotkey)('option+shift+up');
var EXTEND_LINE_FORWARD_MAC = (0, _isHotkey.isKeyHotkey)('option+shift+down');
var EXTEND_LINE_BACKWARD = function EXTEND_LINE_BACKWARD(e) {
  return IS_APPLE && EXTEND_LINE_BACKWARD_MAC(e);
};
var EXTEND_LINE_FORWARD = function EXTEND_LINE_FORWARD(e) {
  return IS_APPLE && EXTEND_LINE_FORWARD_MAC(e);
};

var UNDO = (0, _isHotkey.isKeyHotkey)('mod+z');
var REDO_MAC = (0, _isHotkey.isKeyHotkey)('mod+shift+z');
var REDO_PC = (0, _isHotkey.isKeyHotkey)('mod+y');
var REDO = function REDO(e) {
  return IS_APPLE ? REDO_MAC(e) : REDO_PC(e);
};

var TRANSPOSE_CHARACTER_MAC = (0, _isHotkey.isKeyHotkey)('ctrl+t');
var TRANSPOSE_CHARACTER = function TRANSPOSE_CHARACTER(e) {
  return IS_APPLE && TRANSPOSE_CHARACTER_MAC(e);
};

var CONTENTEDITABLE = function CONTENTEDITABLE(e) {
  return BOLD(e) || DELETE_CHAR_BACKWARD(e) || DELETE_CHAR_FORWARD(e) || DELETE_LINE_BACKWARD(e) || DELETE_LINE_FORWARD(e) || DELETE_WORD_BACKWARD(e) || DELETE_WORD_FORWARD(e) || ITALIC(e) || REDO(e) || SPLIT_BLOCK(e) || TRANSPOSE_CHARACTER(e) || UNDO(e);
};

var COMPOSING = function COMPOSING(e) {
  return e.key == 'ArrowDown' || e.key == 'ArrowLeft' || e.key == 'ArrowRight' || e.key == 'ArrowUp' || e.key == 'Backspace' || e.key == 'Enter';
};

/**
 * Export.
 *
 * @type {Object}
 */

exports.default = {
  BOLD: BOLD,
  COLLAPSE_LINE_BACKWARD: COLLAPSE_LINE_BACKWARD,
  COLLAPSE_LINE_FORWARD: COLLAPSE_LINE_FORWARD,
  COLLAPSE_CHAR_FORWARD: COLLAPSE_CHAR_FORWARD,
  COLLAPSE_CHAR_BACKWARD: COLLAPSE_CHAR_BACKWARD,
  COMPOSING: COMPOSING,
  CONTENTEDITABLE: CONTENTEDITABLE,
  DELETE_CHAR_BACKWARD: DELETE_CHAR_BACKWARD,
  DELETE_CHAR_FORWARD: DELETE_CHAR_FORWARD,
  DELETE_LINE_BACKWARD: DELETE_LINE_BACKWARD,
  DELETE_LINE_FORWARD: DELETE_LINE_FORWARD,
  DELETE_WORD_BACKWARD: DELETE_WORD_BACKWARD,
  DELETE_WORD_FORWARD: DELETE_WORD_FORWARD,
  EXTEND_LINE_BACKWARD: EXTEND_LINE_BACKWARD,
  EXTEND_LINE_FORWARD: EXTEND_LINE_FORWARD,
  EXTEND_CHAR_FORWARD: EXTEND_CHAR_FORWARD,
  EXTEND_CHAR_BACKWARD: EXTEND_CHAR_BACKWARD,
  ITALIC: ITALIC,
  REDO: REDO,
  SPLIT_BLOCK: SPLIT_BLOCK,
  UNDO: UNDO
};