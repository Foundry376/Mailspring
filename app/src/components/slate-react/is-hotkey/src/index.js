
/**
 * Constants.
 */

const IS_MAC = (
  typeof window != 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(window.navigator.platform)
)

const MODIFIERS = {
  alt: 'altKey',
  control: 'ctrlKey',
  meta: 'metaKey',
  shift: 'shiftKey',
}

const ALIASES = {
  add: '+',
  break: 'pause',
  cmd: 'meta',
  command: 'meta',
  ctl: 'control',
  ctrl: 'control',
  del: 'delete',
  down: 'arrowdown',
  esc: 'escape',
  ins: 'insert',
  left: 'arrowleft',
  mod: IS_MAC ? 'meta' : 'control',
  opt: 'alt',
  option: 'alt',
  return: 'enter',
  right: 'arrowright',
  space: ' ',
  spacebar: ' ',
  up: 'arrowup',
  win: 'meta',
  windows: 'meta',
}

const CODES = {
  backspace: 8,
  tab: 9,
  enter: 13,
  shift: 16,
  control: 17,
  alt: 18,
  pause: 19,
  capslock: 20,
  escape: 27,
  ' ': 32,
  pageup: 33,
  pagedown: 34,
  end: 35,
  home: 36,
  arrowleft: 37,
  arrowup: 38,
  arrowright: 39,
  arrowdown: 40,
  insert: 45,
  delete: 46,
  meta: 91,
  numlock: 144,
  scrolllock: 145,
  ';': 186,
  '=': 187,
  ',': 188,
  '-': 189,
  '.': 190,
  '/': 191,
  '`': 192,
  '[': 219,
  '\\': 220,
  ']': 221,
  '\'': 222,
}

for (var f = 1; f < 20; f++) {
  CODES['f' + f] = 111 + f
}

/**
 * Is hotkey?
 */

function isHotkey(hotkey, options, event) {
  if (options && !('byKey' in options)) {
    event = options
    options = null
  }

  const object = parseHotkey(hotkey, options)
  const ret = event == null
    ? e => compareHotkey(object, e)
    : compareHotkey(object, event)

  return ret
}

function isCodeHotkey(hotkey, event) {
  return isHotkey(hotkey, event)
}

function isKeyHotkey(hotkey, event) {
  return isHotkey(hotkey, { byKey: true }, event)
}

/**
 * Parse.
 */

function parseHotkey(hotkey, options) {
  const byKey = options && options.byKey
  const ret = {}

  // Special case to handle the `+` key since we use it as a separator.
  hotkey = hotkey.replace('++', '+add')
  const values = hotkey.split('+')
  const { length } = values

  // Ensure that all the modifiers are set to false unless the hotkey has them.
  for (const k in MODIFIERS) {
    ret[MODIFIERS[k]] = false
  }

  for (let value of values) {
    const name = toKeyName(value)
    const modifier = MODIFIERS[name]

    if (length == 1 || !modifier) {
      if (byKey) {
        ret.key = name
      } else {
        ret.which = toKeyCode(value)
      }
    }

    if (modifier) {
      ret[modifier] = true
    }

    // If there's only one key, and it's not a modifier, ignore the shift key
    // because it will already be taken into accout by the `event.key` value.
    if (length == 1 && !modifier && byKey) {
      ret.shiftKey = null
    }
  }

  return ret
}

/**
 * Compare.
 */

function compareHotkey(object, event) {
  for (const key in object) {
    const expected = object[key]
    let actual

    if (expected == null) continue

    if (key == 'key') {
      actual = event.key.toLowerCase()
    } else if (key == 'which') {
      actual = expected == 91 && event.which == 93 ? 91 : event.which
    } else {
      actual = event[key]
    }

    if (actual != expected) return false
  }

  return true
}

/**
 * Utils.
 */

function toKeyCode(name) {
  name = toKeyName(name)
  const code = CODES[name] || name.toUpperCase().charCodeAt(0)
  return code
}

function toKeyName(name) {
  name = name.toLowerCase()
  name = ALIASES[name] || name
  return name
}

/**
 * Export.
 */

export default isHotkey

export {
  isHotkey,
  isCodeHotkey,
  isKeyHotkey,
  parseHotkey,
  compareHotkey,
  toKeyCode,
  toKeyName,
}
