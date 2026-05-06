/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import { Actions } from 'mailspring-exports';

import ThreadSearchBar from '../lib/thread-search-bar';

describe('ThreadSearchBar', function() {
  beforeEach(function() {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    this.searchBar = ReactTestUtils.renderIntoDocument(<ThreadSearchBar />);
    this.input = ReactDOM.findDOMNode(this.searchBar).querySelector('[contenteditable]');
  });

  it('preserves capitalization on searches', function() {
    spyOn(Actions, 'searchQueryChanged');
    const test = 'HeLlO wOrLd';
    ReactTestUtils.Simulate.input(this.input, { target: { innerText: test } });
    expect(Actions.searchQueryChanged).toHaveBeenCalledWith(test);
  });
});
