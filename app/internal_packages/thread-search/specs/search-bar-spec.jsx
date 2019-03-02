/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';

import ThreadSearchBar from '../lib/thread-search-bar';
import SearchActions from '../lib/search-actions';

describe('ThreadSearchBar', function() {
  beforeEach(function() {
    spyOn(AppEnv, 'isMainWindow').and.returnValue(true);
    this.searchBar = ReactTestUtils.renderIntoDocument(<ThreadSearchBar />);
    this.input = ReactDOM.findDOMNode(this.searchBar).querySelector('input');
  });

  it('supports search queries with a colon character', function() {
    spyOn(SearchActions, 'searchQueryChanged');
    const test = '::Hello: World::';
    ReactTestUtils.Simulate.change(this.input, { target: { value: test } });
    expect(SearchActions.searchQueryChanged).toHaveBeenCalledWith(test);
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
