const fs = require('fs');
const path = require('path');
const React = process.type === 'renderer' ? require('react') : null;

const RTL_LANGS = [
  'ae' /* Avestan */,
  'ar' /* 'العربية', Arabic */,
  'arc' /* Aramaic */,
  'bcc' /* 'بلوچی مکرانی', Southern Balochi */,
  'bqi' /* 'بختياري', Bakthiari */,
  'ckb' /* 'Soranî / کوردی', Sorani */,
  'dv' /* Dhivehi */,
  'fa' /* 'فارسی', Persian */,
  'glk' /* 'گیلکی', Gilaki */,
  'he' /* 'עברית', Hebrew */,
  'ku' /* 'Kurdî / كوردی', Kurdish */,
  'mzn' /* 'مازِرونی', Mazanderani */,
  'nqo' /* N'Ko */,
  'pnb' /* 'پنجابی', Western Punjabi */,
  'ps' /* 'پښتو', Pashto, */,
  'sd' /* 'سنڌي', Sindhi */,
  'ug' /* 'Uyghurche / ئۇيغۇرچە', Uyghur */,
  'ur' /* 'اردو', Urdu */,
  'yi' /* 'ייִדיש', Yiddish */,
];

const locale =
  process.type === 'renderer' ? window.navigator.language : require('electron').app.getLocale();
const lang = locale.split('-')[0] || 'en';
const langsDir = path.join(__dirname, '..', 'lang');

export let isRTL = false;

let localizations = {};

// Load localizations for the base language (eg: `zh`)
if (fs.existsSync(path.join(langsDir, `${lang}.json`))) {
  localizations = require(path.join(langsDir, `${lang}.json`));
  isRTL = RTL_LANGS.includes(lang);
}

// Load localizations for the full locale if present (eg: `zh-CN`)
// and override base localizations with the more specific regional ones.
if (fs.existsSync(path.join(langsDir, `${locale}.json`))) {
  localizations = Object.assign(localizations, require(path.join(langsDir, `${locale}.json`)));
}

export function localized(en, ...subs) {
  let i = 0;
  let translated = localizations[en] || en;
  if (subs.length) {
    // Support "%@ and %@" OR "%1$@ and %2$@" which allows for param reordering.
    // The translation may contain this format even if the original string does not.
    if (translated.includes('%1$@')) {
      subs.forEach((sub, idx) => {
        translated = translated.replace(`%${idx}$@`, sub);
      });
    } else {
      translated = translated.replace(/%@/g, () => subs[i++]);
    }
  }
  return translated;
}

export function localizedReactFragment(en, ...subs) {
  let translated = localizations[en] || en;
  if (!subs.length) {
    return translated;
  }

  // Support "%@ and %@" OR "%1$@ and %2$@" which allows for param reordering.
  // The translation may contain this format even if the original string does not.

  let parts = [];
  let match = null;
  let used = 0;
  while ((match = /%(?:(\d)+\$)?@/g.exec(translated))) {
    if (match.index > 0) {
      parts.push(translated.substr(0, match.index));
    }
    if (match[1]) {
      parts.push(subs[match[1] / 1]);
    } else {
      parts.push(subs[used++]);
    }
    translated = translated.substr(match.index + match[0].length);
  }
  if (translated.length > 0) {
    parts.push(translated);
  }

  return React.createElement(React.Fragment, [], ...parts);
}
