/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
import { Actions, FocusedPerspectiveStore } from 'mailspring-exports';

import ThreadSearchBar from '../lib/thread-search-bar';
import * as SearchBarUtil from '../lib/search-bar-util';

describe('ThreadSearchBar', function () {
  beforeEach(function () {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    this.searchBar = ReactTestUtils.renderIntoDocument(<ThreadSearchBar />);
    this.input = (ReactDOM.findDOMNode(this.searchBar) as HTMLElement).querySelector(
      '[contenteditable]'
    );
  });

  it('preserves capitalization on searches', function () {
    spyOn(Actions, 'searchQueryChanged');
    const test = 'HeLlO wOrLd';
    ReactTestUtils.Simulate.input(this.input, { target: { innerText: test } as any });
    expect(Actions.searchQueryChanged).toHaveBeenCalledWith(test);
  });
});

describe('ThreadSearchBar suggestions', function () {
  let container: HTMLDivElement;
  let bar;
  let pending: { [term: string]: (contacts: string[]) => void };

  const descriptions = () => bar.state.suggestions.map((s) => s.description);
  const type = (query: string) => {
    bar._fieldEl.insertionIndex = () => query.length;
    return bar._generateSuggestionsForQuery(query);
  };

  beforeEach(function () {
    spyOn(FocusedPerspectiveStore, 'current').andReturn({
      accountIds: ['a1', 'a2'],
      isInbox: () => true,
      categories: () => [],
    });
    pending = {};
    spyOn(SearchBarUtil, 'getThreadSuggestions').andReturn(Promise.resolve([]));
    spyOn(SearchBarUtil, 'getContactSuggestions').andCallFake(
      (term: string) => new Promise((resolve) => (pending[term] = resolve))
    );
    container = document.createElement('div');
    const wrapper = ReactDOM.render(<ThreadSearchBar />, container) as any;
    bar = wrapper._composedComponent;
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(container);
  });

  it('keeps the suggestions for the latest text when an older lookup resolves last', async function () {
    const older = type('bob');
    const newer = type('bobby');

    pending['bobby'](['bobby@example.com']);
    await newer;
    expect(descriptions()).toEqual(['bobby@example.com']);

    pending['bob'](['bob@example.com', 'bobby@example.com']);
    await older;
    expect(descriptions()).toEqual(['bobby@example.com']);
  });

  it('ignores a lookup that resolves after the search bar unmounts', async function () {
    const lookup = type('bob');
    spyOn(bar, '_setSuggestionState');
    ReactDOM.unmountComponentAtNode(container);

    pending['bob'](['bob@example.com']);
    await lookup;
    expect(bar._setSuggestionState).not.toHaveBeenCalled();
  });
});
