import { LRUCache } from 'lru-cache';
import {
  QuotedHTMLTransformer,
  localized,
  Actions,
  RegExpUtils,
  getCurrentLocale,
} from 'mailspring-exports';

export const LMStudioDefaults = {
  url: 'http://127.0.0.1:1234/v1',
  model: '',
  apiKey: '',
  targetLanguage: 'en',
};

export const LMStudioConfigKeys = {
  url: 'core.translation.lmStudio.url',
  model: 'core.translation.lmStudio.model',
  apiKey: 'core.translation.lmStudio.apiKey',
  targetLanguage: 'core.translation.lmStudio.targetLanguage',
};

export function getLMStudioSettings() {
  return {
    url: AppEnv.config.get(LMStudioConfigKeys.url) || LMStudioDefaults.url,
    model: AppEnv.config.get(LMStudioConfigKeys.model) || LMStudioDefaults.model,
    apiKey: AppEnv.config.get(LMStudioConfigKeys.apiKey) || LMStudioDefaults.apiKey,
    targetLanguage:
      AppEnv.config.get(LMStudioConfigKeys.targetLanguage) ||
      getCurrentLocale().split('-')[0] ||
      LMStudioDefaults.targetLanguage,
  };
}

export function clearTranslationCache(messageId?: string) {
  let index = [];
  try {
    index = JSON.parse(localStorage.getItem('translated-index-v2') || '[]');
  } catch (_) {
    // Rebuild an empty index if the cache was corrupted.
  }

  if (messageId) {
    localStorage.removeItem(`translated-${messageId}`);
    localStorage.removeItem(`translated-subject-${messageId}`);
    index = index.map((item) => (item.id === messageId ? { ...item, enabled: false } : item));
  } else {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('translated-') && key !== 'translated-index-v2')
      .forEach((key) => localStorage.removeItem(key));
    index = index.map((item) => ({ ...item, enabled: false }));
  }

  localStorage.setItem('translated-index-v2', JSON.stringify(index));
  window.dispatchEvent(
    new CustomEvent('mailspring-translation-updated', {
      detail: messageId ? { id: messageId, cleared: true } : { all: true, cleared: true },
    })
  );
}

function normalizeLMStudioUrl(url: string) {
  const base = (url || LMStudioDefaults.url).replace(/\/+$/, '');
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function extractLMStudioText(data: any) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('')
      .trim();
    if (text) return text;
  }
  throw new Error('LM Studio вернул ответ без текста');
}

function lmStudioError(data: any, status: string) {
  const error = data?.error;
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  return `LM Studio: ${status}`;
}

async function callLMStudio(prompt: string, system: string) {
  const settings = getLMStudioSettings();
  if (!settings.model) {
    throw new Error('Не выбрана модель LM Studio. Откройте Preferences → LM Studio.');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  const response = await fetch(`${normalizeLMStudioUrl(settings.url)}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      stream: false,
    }),
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch (_) {
    // Keep the useful HTTP error below.
  }
  if (!response.ok)
    throw new Error(lmStudioError(data, `${response.status} ${response.statusText}`));
  return extractLMStudioText(data);
}

export async function testLMStudioConnection() {
  const settings = getLMStudioSettings();
  const headers: Record<string, string> = {};
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const response = await fetch(`${normalizeLMStudioUrl(settings.url)}/models`, { headers });
  let data: any = null;
  try {
    data = await response.json();
  } catch (_) {
    // The status error below is more useful than a JSON parsing error.
  }
  if (!response.ok)
    throw new Error(lmStudioError(data, `${response.status} ${response.statusText}`));
  return (data?.data || []).map((model) => model.id).filter(Boolean);
}

const TRANSLATE_SYSTEM_PROMPT =
  'You are a professional translator. Accurately translate the text while preserving its meaning, names, numbers, dates, URLs, email addresses, and formatting. Produce only the translation, without labels, explanations, or commentary.';

export async function translateText(text: string, targetLang: string, isHtml = false) {
  // TranslateGemma responds more reliably to the <text> protocol used by the
  // Thunderbird extension than to a verbose instruction wrapped around HTML.
  const targetName = AllLanguages[targetLang] || targetLang;
  return callLMStudio(
    `You are a professional translator from any source language to ${targetName} (${targetLang}).\nProduce only the ${targetName} translation, without labels or commentary. Translate the text inside the <text> tags:\n\n<text>${text}</text>`,
    TRANSLATE_SYSTEM_PROMPT
  );
}

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
const translatedSnippetCache = new LRUCache<string, string>({ max: 1000 });
let translatedSnippetLang = '';

export async function translateMessageBody(
  html: string,
  targetLang?: string,
  silent = false
): Promise<string | false> {
  if (translatedSnippetLang !== targetLang) {
    translatedSnippetCache.clear();
    translatedSnippetLang = targetLang;
  }

  const replyHtml = QuotedHTMLTransformer.removeQuotedHTML(html);

  // break the document down into text blocks to translate. We don't send the HTML
  // because translation services bill by the character and it's unclear if a giant
  // <style> tag counts.
  const domParser = new DOMParser();
  const doc = domParser.parseFromString(replyHtml, 'text/html');
  // Collect text nodes first. LLM translation backends generally return plain
  // text and may discard wrapper tags such as <b>, so translating one node at
  // a time is more reliable than trying to align a batch of HTML blocks.
  const nodes: { node: Node; text: string }[] = [];

  forEachTranslatableText(doc, (node, text) => {
    nodes.push({ node, text });
  });

  // Translate each text node independently so the result can never be lost
  // because the model removed or reordered HTML tags.
  for (const { node, text } of nodes) {
    const cached = translatedSnippetCache.get(text);
    if (cached) {
      node.textContent = cached;
      continue;
    }

    try {
      const translated = await translateText(text, targetLang);
      node.textContent = translated;
      translatedSnippetCache.set(text, translated);
    } catch (error) {
      Actions.closePopover();
      if (!silent) {
        AppEnv.showErrorDialog({
          title: localized('Language Conversion Failed'),
          message: error.toString(),
        });
      }
      return false;
    }
  }

  // Put the quoted text back in!
  return QuotedHTMLTransformer.appendQuotedHTML(doc.body.innerHTML, html);
}
