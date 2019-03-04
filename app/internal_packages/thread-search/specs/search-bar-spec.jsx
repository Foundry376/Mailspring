/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';

import ThreadSearchBar from '../lib/thread-search-bar';

describe('ThreadSearchBar', function() {
  beforeEach(function() {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    this.searchBar = ReactTestUtils.renderIntoDocument(<ThreadSearchBar />);
    this.input = ReactDOM.findDOMNode(this.searchBar).querySelector('input');
  });

  it('preserves capitalization on searches', function() {
    const test = 'HeLlO wOrLd';
    ReactTestUtils.Simulate.change(this.input, { target: { value: test } });
    waitsFor(() => {
      return this.input.value.length > 0;
    });
    runs(() => {
      expect(this.input.value).toBe(test);
    });
  });
});
