import { prepareEmailColors } from '../lib/email-color-detection';

const DARK_THEME_BG: [number, number, number, number] = [33, 33, 33, 1];

// Abridged from a Google Calendar cancellation: a colored banner, plus text whose
// dark-mode rule turns it light.
const GOOGLE_CALENDAR_BODY = `
<style>
  .primary-text { color: #3c4043 !important; }
  @media (prefers-color-scheme: dark) {
    .primary-text:not([class^="x_"]) { color: #e8eaed !important; }
  }
</style>
<div style="background-color: #fce8e6; padding: 8px;">This event has been canceled.</div>
<div class="primary-text">Tuesday Dec 15, 2026</div>`;

describe('prepareEmailColors', () => {
  let iframeEl: HTMLIFrameElement;

  const render = (html: string, { darkMode }: { darkMode: boolean }) => {
    const doc = iframeEl.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><div id="inbox-html-wrapper">${html}</div>`);
    doc.close();
    const realMatchMedia = doc.defaultView.matchMedia.bind(doc.defaultView);
    spyOn(doc.defaultView, 'matchMedia').andCallFake((query: string) =>
      /prefers-color-scheme/.test(query) ? ({ matches: darkMode } as any) : realMatchMedia(query)
    );
    return doc.getElementById('inbox-html-wrapper');
  };

  beforeEach(() => {
    iframeEl = document.createElement('iframe');
    document.body.appendChild(iframeEl);
  });

  afterEach(() => {
    iframeEl.remove();
  });

  it('keeps an email transparent when its own dark-mode rules apply', () => {
    const wrapper = render(GOOGLE_CALENDAR_BODY, { darkMode: true });
    expect(prepareEmailColors(wrapper, DARK_THEME_BG)).toBe(false);
  });

  it("rewrites near-black text a dark-mode email didn't restyle, but not inside painted boxes", () => {
    const forward = `
      <p style="color: rgb(0, 0, 0)">FYI, see below</p>
      <div style="background-color: #fce8e6;"><span style="color: rgb(0, 0, 0)">Canceled</span></div>
      ${GOOGLE_CALENDAR_BODY}`;
    const wrapper = render(forward, { darkMode: true });
    expect(prepareEmailColors(wrapper, DARK_THEME_BG)).toBe(false);
    expect(wrapper.querySelector('p').style.color).toContain('var(--email-text-color');
    expect(wrapper.querySelector('span').style.color).toBe('rgb(0, 0, 0)');
  });

  it('finds dark-mode rules nested in other grouping rules', () => {
    const nested = GOOGLE_CALENDAR_BODY.replace(
      '@media',
      '@supports (display: block) { @media'
    ).replace('</style>', '}</style>');
    const wrapper = render(nested, { darkMode: true });
    expect(prepareEmailColors(wrapper, DARK_THEME_BG)).toBe(false);
  });

  it("gives near-black text the theme's email text color in a form print can override", () => {
    const wrapper = render('<p style="color: rgb(0, 0, 0)">Signature</p>', { darkMode: false });
    expect(prepareEmailColors(wrapper, DARK_THEME_BG)).toBe(false);
    expect(wrapper.querySelector('p').style.color).toContain('var(--email-text-color');
  });

  it('ignores dark-mode rules that only swap images', () => {
    const logoSwap = `
      <style>@media (prefers-color-scheme: dark) { .logo-dark { display: block !important; } }</style>
      <table style="background-color: #ffffff;"><tr><td>Weekly digest</td></tr></table>`;
    const wrapper = render(logoSwap, { darkMode: true });
    expect(prepareEmailColors(wrapper, DARK_THEME_BG)).toBe(true);
  });

  it('still uses a white page for a painted email when its dark-mode rules do not apply', () => {
    const wrapper = render(GOOGLE_CALENDAR_BODY, { darkMode: false });
    expect(prepareEmailColors(wrapper, DARK_THEME_BG)).toBe(true);
  });
});
