import { matchAppColorScheme } from '../lib/email-frame';

// Abridged from a Salesforce-sent reply whose <head> carried the Dark Reader
// extension's injected stylesheets (community.getmailspring.com/t/14590).
const DARK_READER_HEAD = `<style class="darkreader darkreader--user-agent" media="screen" type="text/css">@layer {
html {
    color-scheme: dark !important;
}
html, body {
    color: var(--darkreader-text-000000, #e8e6e3);
}
}</style>`;

describe('matchAppColorScheme', () => {
  let iframeEl: HTMLIFrameElement;

  const writeEmail = (html: string) => {
    const doc = iframeEl.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><div id="inbox-html-wrapper">${html}Hello</div>`);
    doc.close();
    return doc;
  };

  const rootScheme = (doc: Document) =>
    doc.defaultView.getComputedStyle(doc.documentElement).colorScheme;

  beforeEach(() => {
    iframeEl = document.createElement('iframe');
    document.body.appendChild(iframeEl);
  });

  afterEach(() => {
    iframeEl.remove();
  });

  it('overrides a color-scheme declared with !important inside an @layer', () => {
    const doc = writeEmail(DARK_READER_HEAD);
    expect(rootScheme(doc)).toBe('dark');

    matchAppColorScheme(doc, iframeEl);
    expect(rootScheme(doc)).toBe(window.getComputedStyle(iframeEl).colorScheme);
  });

  it('overrides a :root light/dark declaration', () => {
    const doc = writeEmail('<style>:root { color-scheme: light dark; }</style>');
    expect(rootScheme(doc)).toBe('light dark');

    matchAppColorScheme(doc, iframeEl);
    expect(rootScheme(doc)).toBe(window.getComputedStyle(iframeEl).colorScheme);
  });
});
