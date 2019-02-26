/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const React = require('react');
const ReactDOM = require('react-dom');
const ReactTestUtils = require('react-dom/test-utils');

const ThreadSearchBar = require('../lib/thread-search-bar').default;
const SearchActions = require('../lib/search-actions').default;

describe('ThreadSearchBar', function() {
  beforeEach(function() {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
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
