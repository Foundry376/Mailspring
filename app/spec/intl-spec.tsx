import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localized, localizedReactFragment } from '../src/intl';

describe('intl', function () {
  describe('localized', function () {
    it('substitutes %@ placeholders in order', function () {
      expect(localized('%@ of %@', 'a', 'b')).toEqual('a of b');
    });

    it('substitutes numbered placeholders by argument position', function () {
      expect(localized('%2$@ then %1$@', 'a', 'b')).toEqual('b then a');
    });
  });

  describe('localizedReactFragment', function () {
    it('substitutes %@ placeholders in order', function () {
      const html = renderToStaticMarkup(localizedReactFragment('%@ of %@', <b>a</b>, 'b'));
      expect(html).toEqual('<b>a</b> of b');
    });

    it('substitutes numbered placeholders by argument position', function () {
      const html = renderToStaticMarkup(
        localizedReactFragment('%2$@ then %1$@', <b>a</b>, <i>b</i>)
      );
      expect(html).toEqual('<i>b</i> then <b>a</b>');
    });
  });
});
