import { EmailFrameStylesStore } from '../lib/email-frame-styles-store';

describe('EmailFrameStylesStore', () => {
  let store: EmailFrameStylesStore;
  let coreSheet: HTMLStyleElement;
  let themeSheet: HTMLStyleElement;

  beforeEach(() => {
    coreSheet = document.createElement('style');
    coreSheet.setAttribute('source-path', '/static/style/email-frame.less');
    coreSheet.innerText = '.ignore-in-parent-frame body { font-family: test; }';
    document.head.appendChild(coreSheet);

    themeSheet = document.createElement('style');
    themeSheet.setAttribute('source-path', '/themes/example/email-frame.less');
    themeSheet.innerText = '.ignore-in-parent-frame body { filter: invert(100%); }';
    document.head.appendChild(themeSheet);

    store = new EmailFrameStylesStore();
  });

  afterEach(() => {
    store._unlistenToStyles();
    coreSheet.remove();
    themeSheet.remove();
  });

  const stylesFor = (mode: string) => {
    spyOn(AppEnv.config, 'get').andReturn(mode);
    store._findStyles();
    return store.styles();
  };

  it('keeps app theme filters out of light email rendering', () => {
    const { themeStyles, renderModeStyles } = stylesFor('light');

    expect(themeStyles).toContain('font-family: test');
    expect(themeStyles).not.toContain('filter: invert(100%)');
    expect(renderModeStyles).toContain('body { filter: none !important;');
    expect(renderModeStyles).toContain('img { filter: none !important; }');
  });

  it('uses one controlled inversion layer for dark email rendering', () => {
    const { themeStyles, renderModeStyles } = stylesFor('dark');

    expect(themeStyles).not.toContain('filter: invert(100%)');
    expect(renderModeStyles).toContain('body { filter: invert(100%) hue-rotate(180deg)');
    expect(renderModeStyles).toContain('img { filter: invert(100%) hue-rotate(180deg)');
  });

  it('treats legacy theme mode as light email rendering', () => {
    const { themeStyles, renderModeStyles } = stylesFor('theme');

    expect(themeStyles).not.toContain('filter: invert(100%)');
    expect(renderModeStyles).toContain('body { filter: none !important;');
  });
});
