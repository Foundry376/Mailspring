import {
  QuotedHTMLTransformer,
  localized,
  Actions,
  MailspringAPIRequest,
} from 'mailspring-exports';

export const TranslatePopupOptions = {
  English: 'en',
  Spanish: 'es',
  Russian: 'ru',
  Chinese: 'zh',
  Arabic: 'ar',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Japanese: 'ja',
  Portuguese: 'pt',
  Hindi: 'hi',
  Korean: 'ko',
};

export const AllLanguages = {
  az: 'Azerbaijan',
  ml: 'Malayalam',
  sq: 'Albanian',
  mt: 'Maltese',
  am: 'Amharic',
  mk: 'Macedonian',
  en: 'English',
  mi: 'Maori',
  ar: 'Arabic',
  mr: 'Marathi',
  hy: 'Armenian',
  mhr: 'Mari',
  af: 'Afrikaans',
  mn: 'Mongolian',
  eu: 'Basque',
  de: 'German',
  ba: 'Bashkir',
  ne: 'Nepali',
  be: 'Belarusian',
  no: 'Norwegian',
  bn: 'Bengali',
  pa: 'Punjabi',
  my: 'Burmese',
  pap: 'Papiamento',
  bg: 'Bulgarian',
  fa: 'Persian',
  bs: 'Bosnian',
  pl: 'Polish',
  cy: 'Welsh',
  pt: 'Portuguese',
  hu: 'Hungarian',
  ro: 'Romanian',
  vi: 'Vietnamese',
  ru: 'Russian',
  ht: 'Haitian (Creole)',
  ceb: 'Cebuano',
  gl: 'Galician',
  sr: 'Serbian',
  nl: 'Dutch',
  si: 'Sinhala',
  mrj: 'Hill Mari',
  sk: 'Slovakian',
  el: 'Greek',
  sl: 'Slovenian',
  ka: 'Georgian',
  sw: 'Swahili',
  gu: 'Gujarati',
  su: 'Sundanese',
  da: 'Danish',
  tg: 'Tajik',
  he: 'Hebrew',
  th: 'Thai',
  yi: 'Yiddish',
  tl: 'Tagalog',
  id: 'Indonesian',
  ta: 'Tamil',
  ga: 'Irish',
  tt: 'Tatar',
  it: 'Italian',
  te: 'Telugu',
  is: 'Icelandic',
  tr: 'Turkish',
  es: 'Spanish',
  udm: 'Udmurt',
  kk: 'Kazakh',
  uz: 'Uzbek',
  kn: 'Kannada',
  uk: 'Ukrainian',
  ca: 'Catalan',
  ur: 'Urdu',
  ky: 'Kyrgyz',
  fi: 'Finnish',
  zh: 'Chinese',
  fr: 'French',
  ko: 'Korean',
  hi: 'Hindi',
  xh: 'Xhosa',
  hr: 'Croatian',
  km: 'Khmer',
  cs: 'Czech',
  lo: 'Laotian',
  sv: 'Swedish',
  la: 'Latin',
  gd: 'Scottish',
  lv: 'Latvian',
  et: 'Estonian',
  lt: 'Lithuanian',
  eo: 'Esperanto',
  lb: 'Luxembourgish',
  jv: 'Javanese',
  mg: 'Malagasy',
  ja: 'Japanese',
  ms: 'Malay',
};

export const TranslationsUsedLexicon = {
  headerText: localized('All Translations Used'),
  rechargeText: `${localized(
    'You can translate up to %1$@ emails each %2$@ with Mailspring Basic.'
  )} ${localized('Upgrade to Pro today!')}`,
  iconUrl: 'mailspring://translation/assets/ic-translation-modal@2x.png',
};

export async function translateMessageBody(
  html: string,
  targetLang?: string,
  silent: boolean = false
): Promise<string | false> {
  const text = QuotedHTMLTransformer.removeQuotedHTML(html);

  let response = null;
  try {
    response = await MailspringAPIRequest.makeRequest({
      server: 'identity',
      method: 'POST',
      path: `/api/translate`,
      json: true,
      body: { lang: targetLang, text, format: 'html' },
      timeout: 5000,
    });
  } catch (error) {
    Actions.closePopover();
    if (!silent) {
      const dialog = require('electron').remote.dialog;
      dialog.showErrorBox(localized('Language Conversion Failed'), error.toString());
    }
    return false;
  }

  return QuotedHTMLTransformer.appendQuotedHTML(response.result, html);
}
