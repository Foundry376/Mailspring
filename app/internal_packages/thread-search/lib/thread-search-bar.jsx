import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ListensToFluxStore, RetinaImg, KeyCommandsRegion } from 'mailspring-component-kit';
import { Actions, FocusedPerspectiveStore, WorkspaceStore } from 'mailspring-exports';
import SearchStore from './search-store';
import TokenizingContenteditable from './tokenizing-contenteditable';

var utf7 = require('utf7').imap;

import {
  LearnMoreURL,
  TokenSuggestions,
  TokenSuggestionsForEmpty,
  TokenAndTermRegexp,
  getCurrentTokenAndTerm,
  getContactSuggestions,
  getThreadSuggestions,
  wrapInQuotes,
} from './search-bar-util';

class ThreadSearchBar extends Component {
  static displayName = 'ThreadSearchBar';

  static propTypes = {
    query: PropTypes.string,
    isSearching: PropTypes.bool,
    perspective: PropTypes.object,
  };

  constructor(props) {
    super(props);
    this.state = {
      suggestions: TokenSuggestionsForEmpty,
      focused: false,
      selected: null,
      selectedIdx: -1,
    };
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.query !== this.props.query) {
      this._generateSuggestionsForQuery(nextProps.query);
    }
  }

  _initialQueryForPerspective() {
    const { perspective } = this.props;

    // When the inbox is focused we don't specify a folder scope. If the user
    // wants to search just the inbox then they have to specify it explicitly.
    if (perspective.starred) {
      return 'is:starred ';
    }
    if (perspective.unread) {
      return 'is:unread in:inbox ';
    }
    if (perspective.isInbox()) {
      return '';
    }
    const rolesAndPaths = [
      ...new Set(perspective.categories().map(c => c.role || wrapInQuotes(c.path))),
    ];
    if (rolesAndPaths.length > 1) {
      return `(in:${rolesAndPaths.join(' OR in:')}) `;
    } else if (rolesAndPaths.length === 1) {
      return `in:${rolesAndPaths[0]} `;
    } else {
      return '';
    }
  }

  async _generateSuggestionsForQuery(query) {
    let insertionIndex = this._fieldEl.insertionIndex();

    // Treat the initial query (eg: "in:starred AND ") as if it's
    // not there, so the user sees the empty string case at first, etc.
    const initialQuery = this._initialQueryForPerspective();
    if (query.startsWith(initialQuery)) {
      query = query.substr(initialQuery.length);
      insertionIndex -= initialQuery.length;
    }

    const { token, term } = getCurrentTokenAndTerm(query, insertionIndex);
    const accountIds = this.props.perspective.accountIds;

    const promises = [];
    let suggestions = [];

    if (token) {
      // show token autocompletion options ala Stripe Dashboard
      suggestions = TokenSuggestions.filter(s => s.token.startsWith(token));

      if (suggestions.length && suggestions[0].token === token) {
        const { termSuggestions } = suggestions[0];
        const textToSuggestion = term => ({
          term: wrapInQuotes(term),
          description: term.includes(' ') ? wrapInQuotes(term) : term,
          token,
        });

        if (termSuggestions instanceof Function) {
          suggestions = [];
          promises.push(
            termSuggestions(term, accountIds).then(results => {
              suggestions.push(...results.map(textToSuggestion));
            }),
          );
        } else {
          suggestions = termSuggestions
            .filter(t => !term || (t.startsWith(term) && t !== term))
            .map(textToSuggestion);
        }
      }
    } else if (query.length === 0) {
      // show all token autocompletion options before the user starts typing
      suggestions = TokenSuggestionsForEmpty;
    } else if (query.length > 2 && TokenAndTermRegexp().test(query.trim()) === false) {
      // show thread and contact suggestions ala Gmail
      suggestions = [];
      promises.push(
        Promise.props({
          subjects: getThreadSuggestions(query, accountIds).then(threads =>
            threads.map(t => ({
              token: null,
              term: wrapInQuotes(t.subject),
              description: t.subject,
              thread: t,
            })),
          ),
          contacts: getContactSuggestions(query, accountIds).then(results =>
            results.map(term => ({ token: null, term: wrapInQuotes(term), description: term })),
          ),
        }).then(({ contacts, subjects }) => {
          suggestions = [...contacts, ...subjects].sort((a, b) => {
            let aM = a.description.toLowerCase().indexOf(query);
            let bM = b.description.toLowerCase().indexOf(query);
            if (aM === -1) aM = 10000;
            if (bM === -1) bM = 10000;
            return aM - bM;
          });
          if (suggestions.length > 10) {
            suggestions.length = 10;
          }
        }),
      );
    }

    if (promises.length) {
      await Promise.all(promises);
      this._setSuggestionState(suggestions);
    } else {
      this._setSuggestionState(suggestions);
    }
  }

  _fieldElFocus = () => {
    if (this._fieldEl) {
      this._fieldEl.focus();
    }
  };

  _onFocus = e => {
    this.setState({ focused: true });
    if (this.props.query === '') {
      this._onSearchQueryChanged(this._initialQueryForPerspective());
      window.requestAnimationFrame(() => {
        this._fieldElFocus()
      });
    }
  };

  _onBlur = e => {
    this.setState({ focused: false });
    if (this.props.query === this._initialQueryForPerspective()) {
      this._onSearchQueryChanged('');
    }
  };

  _onKeyDown = e => {
    const { suggestions, selected, selectedIdx } = this.state;
    const delta = { 40: 1, 38: -1 }[e.keyCode];

    if (delta) {
      e.preventDefault();

      const nextIdx = Math.min(suggestions.length - 1, Math.max(0, selectedIdx + delta));

      this.setState({
        selectedIdx: nextIdx,
        selected: suggestions[nextIdx],
      });
    }

    if (e.keyCode === 27) {
      // escape
      e.preventDefault();
      this._onClearSearchQuery(e);
    }
    if (e.keyCode === 13) {
      // return
      e.preventDefault();
      if (selected) {
        this._onChooseSuggestion(selected);
      } else {
        this._onSubmitSearchQuery(this.props.query);
      }
    }
  };

  _onChooseSuggestion = suggestion => {
    const { query } = this.props;

    let nextQuery = null;

    // If the user has the cursor inside an existing token, replace it. If the query ends
    // in a space, append a new token. Otherwise replace the whole string.
    let { index, length } = getCurrentTokenAndTerm(query, this._fieldEl.insertionIndex());
    if (index === -1 && query.endsWith(' ')) {
      index = query.length;
      length = 0;
    }

    if (suggestion.token) {
      nextQuery = [
        query.substr(0, index).trim(),
        `${suggestion.token}:${suggestion.term}`,
        query.substr(index + length).trim(),
      ]
        .filter(s => s.length)
        .join(' ');
    } else {
      nextQuery = suggestion.term;
    }

    if (!nextQuery.endsWith(' ')) {
      nextQuery = nextQuery + ' ';
    }
    if (suggestion.term) {
      this._onSubmitSearchQuery(nextQuery);
    } else {
      this._onSearchQueryChanged(nextQuery);
    }

    if (suggestion.thread && WorkspaceStore.layoutMode() !== 'list') {
      Actions.setFocus({ collection: 'thread', item: suggestion.thread });
    }
  };

  _onSearchQueryChanged = async query => {
    if (query === this.props.query) {
      return;
    }
    Actions.searchQueryChanged(query);
    if (query === '') {
      this._onClearSearchQuery();
    }
  };

  _setSuggestionState = suggestions => {
    const sameItemIdx = suggestions.findIndex(
      s => this.state.selected && s.description === this.state.selected.description,
    );
    const backupIdx = Math.max(-1, Math.min(this.state.selectedIdx, suggestions.length - 1));
    const selectedIdx = sameItemIdx !== -1 ? sameItemIdx : backupIdx;

    this.setState({
      suggestions: suggestions,
      selectedIdx: selectedIdx,
      selected: selectedIdx !== -1 ? suggestions[selectedIdx] : null,
    });
  };

  _onSubmitSearchQuery = nextQuery => {
    const SPACE = ' ';
    // for the chinese folder name
    const input = nextQuery.split(SPACE).map(item => {
      if (item.indexOf('in:') !== -1) {
        item = utf7.encode(item);
      }
      return item;
    });
    nextQuery = input.join(SPACE);
    Actions.searchQuerySubmitted(nextQuery);
    this._fieldEl.blur();
  };

  _onClearSearchQuery = e => {
    if (this.props.query !== '') {
      Actions.searchQuerySubmitted('');
    } else {
      this._fieldEl.blur();
    }
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  _placeholder = () => {
    if (this._initialQueryForPerspective() === '') {
      return 'Search all emails';
    }
    return `Search ${this.props.perspective.name || ''}`;
  };

  render() {
    const { query, isSearching, perspective } = this.props;
    const { suggestions, selectedIdx } = this.state;

    const showPlaceholder = !this.state.focused && !query;
    const showX = this.state.focused || !!perspective.searchQuery;

    return (
      <KeyCommandsRegion
        className={`thread-search-bar ${showPlaceholder ? 'placeholder' : ''}`}
        globalHandlers={{
          'core:focus-search': () => {
            // If the user is in list mode, we need to clear the selection because the
            // thread action bar appears over the search bar. Kind of a hack.
            if (WorkspaceStore.layoutMode() === 'list') {
              AppEnv.commands.dispatch('multiselect-list:deselect-all');
            }
            Actions.popSheet({ reason: 'ThreadSearch:KeyCommandsRegion' });
            this._fieldElFocus();
          },
        }}
      >
        {isSearching ? (
          <RetinaImg
            className="search-accessory search loading"
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentPreserve}
          />
        ) : (
          <RetinaImg
            className="search-accessory search"
            name="searchloupe.png"
            mode={RetinaImg.Mode.ContentDark}
            onClick={() => this._fieldElFocus()}
          />
        )}
        <TokenizingContenteditable
          ref={el => (this._fieldEl = el)}
          value={showPlaceholder ? this._placeholder() : utf7.decode(query)}
          onKeyDown={this._onKeyDown}
          onFocus={this._onFocus}
          onBlur={this._onBlur}
          onChange={this._onSearchQueryChanged}
        />
        {showX && (
          <RetinaImg
            name="searchclear.png"
            className="search-accessory clear"
            mode={RetinaImg.Mode.ContentDark}
            onMouseDown={this._onClearSearchQuery}
          />
        )}
        {this.state.suggestions.length > 0 &&
        this.state.focused && (
          <div className="suggestions">
            {suggestions.map((s, idx) => (
              <div
                onMouseDown={e => {
                  this._onChooseSuggestion(s);
                  e.preventDefault();
                }}
                className={`suggestion ${selectedIdx === idx ? 'selected' : ''}`}
                key={`${idx}`}
              >
                {s.token && <span className="suggestion-token">{s.token}: </span>}
                {s.description}
              </div>
            ))}
            {suggestions === TokenSuggestionsForEmpty && (
              <div className="footer">
                Pro tip: Combine search terms with AND and OR to create complex queries.{' '}
                {/*<a*/}
                {/*  onMouseDown={e => {*/}
                {/*    AppEnv.windowEventHandler.openLink({*/}
                {/*      href: LearnMoreURL,*/}
                {/*      metaKey: e.metaKey,*/}
                {/*    });*/}
                {/*    e.preventDefault();*/}
                {/*  }}*/}
                {/*>*/}
                {/*  Learn more >*/}
                {/*</a>*/}
              </div>
            )}
          </div>
        )}
      </KeyCommandsRegion>
    );
  }
}

export default ListensToFluxStore(ThreadSearchBar, {
  stores: [SearchStore, FocusedPerspectiveStore],
  getStateFromStores() {
    return {
      query: SearchStore.query(),
      isSearching: SearchStore.isSearching(),
      perspective: FocusedPerspectiveStore.current(),
    };
  },
});
