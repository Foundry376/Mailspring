import LRU from 'lru-cache';
import {
  QuotedHTMLTransformer,
  localized,
  Actions,
  MailspringAPIRequest,
  RegExpUtils,
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

function forEachTranslatableText(doc: Document, callback: (el: Node, text: string) => void) {
  const textWalker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const urlRegexp = RegExpUtils.urlRegex({ matchStartOfString: true, matchTailOfString: true });
  const usaAddressRegexp = /, [A-Z]{2},? [A-Z]{2,3},? [\d]{5}/; // matches ", CA 94114"

  while (textWalker.nextNode()) {
    const node = textWalker.currentNode;
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE'].includes(node.parentElement.tagName)) {
      continue;
    }

    if (node.parentElement.closest('.notranslate')) {
      continue; // the HTML explicitly requests this text not be translated
    }

    const text = node.textContent.replace(/\s{2,}/g, ' ');
    if (!/[A-Za-z\p{L}]+/u.test(text)) {
      continue; // there are no latin or unicode letters in the string
    }
    if (urlRegexp.test(text.trim())) {
      continue; // purely a plaintext link
    }

    if (text.length < 250 && usaAddressRegexp.test(text)) {
      continue; // looks very much like a US address. Don't awkwardly translate these
    }

    const closestWithFont = node.parentElement.closest('[style*=font]');
    if (closestWithFont instanceof HTMLElement) {
      const family = closestWithFont.style.fontFamily || closestWithFont.style.font || '';
      if (
        family.includes('monospace') ||
        family.includes('Monaco') ||
        family.includes('Lucida Console') ||
        family.includes('Courier')
      ) {
        continue; // the text is in a monospace font and is probably a meaningful "value / variable"
      }

      const size = Number((closestWithFont.style.fontSize || '').replace(/[A-Za-z]+/g, ''));
      if (size > 0 && size < 12) {
        continue; // the text is tiny or hidden, don't waste translation characters on footer stuff
      }
    }

    if (text.length > 2) {
      // we will translate this text. But trim out large blocks of whitespace that may
      // exist in the raw textContent to avoid those counting as translation characters.
      // NOTE: We use node.textContent here, not the trimmed version. The leading/trailing
      // space are necessary for things like <span>this is a <a>link</a></span>
      callback(node, text);
    }
  }
}

// We maintain a cache of blocks of text we've translated. Because the user may have a whole
// mailbox of very similar or templated emails, this can cut down on the amount of text we
// need to translate for a new email dramatically.
let translatedSnippetCache = new LRU<string, string>({ max: 1000 });
let translatedSnippetLang = '';

export async function translateMessageBody(
  html: string,
  targetLang?: string,
  silent: boolean = false
): Promise<string | false> {
  if (translatedSnippetLang !== targetLang) {
    translatedSnippetCache.reset();
    translatedSnippetLang = targetLang;
  }

  const replyHtml = QuotedHTMLTransformer.removeQuotedHTML(html);

  // break the document down into text blocks to translate. We don't send the HTML
  // because translation services bill by the character and it's unclear if a giant
  // <style> tag counts.
  const domParser = new DOMParser();
  const doc = domParser.parseFromString(replyHtml, 'text/html');
  const translationDoc = document.createElement('div');

  // Iterate over the HTML document and pull out text blocks we need to translate via the API

  // because LRU cache can change while the req is in flight
  const skipped: { [text: string]: string } = {};
  let totalChars = 0;

  forEachTranslatableText(doc, (node, text) => {
    const t = translatedSnippetCache.get(text);
    if (t) {
      skipped[text] = t;
      return;
    }
    if (totalChars > 5000) {
      return;
    }
    const b = document.createElement('b');
    b.textContent = text;
    totalChars += text.length + 7; // <b></b>;
    translationDoc.appendChild(b);
  });

  let resultElements = [];

  // Make the translation request
  if (translationDoc.childElementCount > 0) {
    const translationHTML = translationDoc.innerHTML.replace(/&nbsp;/g, ' '); // nbsp char

    let response = null;
    try {
      response = await MailspringAPIRequest.makeRequest({
        server: 'identity',
        method: 'POST',
        path: `/api/translate`,
        json: true,
        body: { lang: targetLang, text: translationHTML, format: 'html' },
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

    const resultDoc = domParser.parseFromString(response.result, 'text/html');
    resultElements = Array.from(resultDoc.querySelectorAll('b'));
  }

  // Merge the results back in to the original document by traversing it in the same order
  // and inserting the result back in. Note that we have saved our cache hits into `skipped`
  // and read them from there to be 100% sure the translation indexes still align with the doc.
  forEachTranslatableText(doc, (node, text) => {
    if (skipped[text]) {
      node.textContent = skipped[text];
    } else {
      const resultElement = resultElements.shift();
      if (resultElement) {
        const translated = resultElement.textContent;
        node.textContent = translated;
        translatedSnippetCache.set(text, translated);
      } else {
        // we may have hit the `totalChars` per-email translation limit.
        // nothing more to do here!
      }
    }
  });

  // Put the quoted text back in!
  return QuotedHTMLTransformer.appendQuotedHTML(doc.body.innerHTML, html);
}
