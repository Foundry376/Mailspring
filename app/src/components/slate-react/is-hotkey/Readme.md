
# is-hotkey

A simple way to check whether a browser event matches a hotkey.

---

### Features

- Uses a simple, natural syntax for expressing hotkeys—`mod+s`, `cmd+alt+space`, etc.
- Accepts `mod` for the classic "`cmd` on Mac, `ctrl` on Windows" use case.
- Can use either `event.which` (default) or `event.key` to work regardless of keyboard layout.
- Can be curried to reduce parsing and increase performance when needed.
- Is very lightweight, weighing in at `< 1kb` minified and gzipped.

---

### Example

The most basic usage...

```js
import isHotkey from 'is-hotkey'

function onKeyDown(e) {
  if (isHotkey('mod+s', e)) {
    ...
  }
}
```

Or, you can curry the hotkey string for better performance, since it is only parsed once...

```js
import isHotkey from 'is-hotkey'

const isSaveHotkey = isHotkey('mod+s')

function onKeyDown(e) {
  if (isSaveHotkey(e)) {
    ...
  }
}
```

That's it!

---

### Why?

There are tons of hotkey libraries, but they're often coupled to the view layer, or they bind events globally, or all kinds of weird things. You don't really want them to bind the events for you, you can do that yourself. 

Instead, you want to just check whether a single event matches a hotkey. And you want to define your hotkeys in the standard-but-non-trivial-to-parse syntax that everyone knows.

But most libraries don't expose their parsing logic. And even for the ones that do expose their hotkey parsing logic, pulling in an entire library just to check a hotkey string is overkill.

So... this is a simple and lightweight hotkey checker!

---

### API

```js
import isHotkey from 'is-hotkey'

isHotkey('mod+s')(event)
isHotkey('mod+s', { byKey: true })(event)

isHotkey('mod+s', event)
isHotkey('mod+s', { byKey: true }, event)
```

You can either pass `hotkey, [options], event` in which case the hotkey will be parsed and compared immediately. Or you can passed just `hotkey, [options]` to receive a curried checking function that you can re-use for multiple events.

```js
isHotkey('mod+a')
isHotkey('Control+S')
isHotkey('⌘+d')
itHotkey('Meta+DownArrow')
itHotkey('cmd+down')
```

The API is case-insentive, and has all of the conveniences you'd expect—`cmd` vs. `Meta`, `opt` vs. `Alt`, `down` vs. `DownArrow`, etc. 

It also accepts `mod` for the classic "`cmd` on Mac, `ctrl` on Windows" use case.

```js
import isHotkey from 'is-hotkey'
import { isCodeHotkey, isKeyHotkey } from 'is-hotkey'

isHotkey('mod+s')(event)
isHotkey('mod+s', { byKey: true })(event)

isCodeHotkey('mod+s', event)
isKeyHotkey('mod+s', event)
```

By default the hotkey string is checked using `event.which`. But you can also pass in `byKey: true` to compare using the [`KeyboardEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key) API, which stays the same regardless of keyboard layout.

Or to reduce the noise if you are defining lots of hotkeys, you can use the `isCodeHotkey` and `isKeyHotkey` helpers that are exported.

```js
import { toKeyName, toKeyCode } from 'is-hotkey'

toKeyName('cmd') // "meta"
toKeyName('a') // "a"

toKeyCode('shift') // 16
toKeyCode('a') // 65
```

You can also use the exposed `toKeyName` and `toKeyCode` helpers, in case you want to add the same level of convenience to your own APIs.

```js
import { parseHotkey, compareHotkey } from 'is-hotkey'

const hotkey = parseHotkey('mod+s', { byKey: true })
const passes = compareHotkey(hotkey, event)
```

You can also go even more low-level with the exposed `parseHotkey` and `compareHotkey` functions, which are what the default `isHotkey` export uses under the covers, in case you have more advanced needs.

---

### License

This package is [MIT-licensed](License.md).
