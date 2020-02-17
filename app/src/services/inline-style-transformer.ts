/* eslint global-require: 0 */
import { ipcRenderer } from 'electron';
import crypto from 'crypto';

import RegExpUtils from '../regexp-utils';

let userAgentDefault = null;

class InlineStyleTransformer {
  _inlineStylePromises: { [key: string]: Promise<string> } = {};
  _inlineStyleResolvers: { [key: string]: (result: string) => void } = {};

  constructor() {
    ipcRenderer.on('inline-styles-result', this._onInlineStylesResult);
  }

  run = (html: string) => {
    if (!this._requiresProcessing(html)) {
      return Promise.resolve(html);
    }

    const key = crypto
      .createHash('md5')
      .update(html)
      .digest('hex');

    if (this._inlineStylePromises[key] == null) {
      html = this._prepareHTMLForInlineStyling(html);

      this._inlineStylePromises[key] = new Promise(resolve => {
        this._inlineStyleResolvers[key] = resolve;
        ipcRenderer.send('inline-style-parse', { html, key });
      });
    }
    return this._inlineStylePromises[key];
  };

  runSync = (html: string) => {
    if (!this._requiresProcessing(html)) return html;
    html = this._prepareHTMLForInlineStyling(html);
    return ipcRenderer.sendSync('inline-style-parse', { html, key: '' });
  };

  _requiresProcessing(html: string) {
    if (!html || typeof html !== 'string' || html.length <= 0) {
      return false;
    }
    if (!RegExpUtils.looseStyleTag().test(html)) {
      return false;
    }
    return true;
  }

  _prepareHTMLForInlineStyling(html: string) {
    // http://stackoverflow.com/questions/8695031/why-is-there-often-a-inside-the-style-tag
    // https://regex101.com/r/bZ5tX4/1
    let result = html.replace(
      /<style[^>]*>[\n\r \t]*<!--([^</]*)-->[\n\r \t]*<\/style/g,
      (full, content) => `<style>${content}</style`
    );

    result = this._injectUserAgentStyles(result);

    return result;
  }

  // This will prepend the user agent stylesheet so we can apply it to the
  // styles properly.
  _injectUserAgentStyles(body) {
    // No DOM parsing! Just find the first <style> tag and prepend there.
    const i = body.search(RegExpUtils.looseStyleTag());
    if (i === -1) {
      return body;
    }

    if (typeof userAgentDefault === 'undefined' || userAgentDefault === null) {
      userAgentDefault = require('../chrome-user-agent-stylesheet-string').default;
    }
    return `${body.slice(0, i)}<style>${userAgentDefault}</style>${body.slice(i)}`;
  }

  _onInlineStylesResult = (event, { html, key }) => {
    delete this._inlineStylePromises[key];
    this._inlineStyleResolvers[key](html);
    delete this._inlineStyleResolvers[key];
  };
}

export default new InlineStyleTransformer();
