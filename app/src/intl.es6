const fs = require('fs');
const React = process.type === 'renderer' ? require('react') : null;
const locale =
  process.type === 'renderer' ? window.navigator.language : require('electron').app.getLocale();
const lang = locale.split('-')[0] || 'en';

let localizations = {};
if (fs.existsSync(__dirname + `/../lang/${lang}.json`)) {
  localizations = require(__dirname + `/../lang/${lang}.json`);
}

export function localized(en, ...subs) {
  // TODO support %2$@
  let i = 0;
  let translated = localizations[en] || en;
  return translated.replace('%@', () => subs[i++]);
}

export function localizedReactFragment(en, ...subs) {
  let translated = localizations[en] || en;
  translated = translated.split('%@');
  for (let i = 0; i < subs.length; i += 1) {
    translated.splice(i * 2 + 1, 0, subs.shift());
  }
  return React.createElement(React.Fragment, [], ...translated);
}
