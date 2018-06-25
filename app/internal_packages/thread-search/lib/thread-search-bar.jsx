import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ListensToFluxStore, RetinaImg } from 'mailspring-component-kit';
import { Actions, FocusedPerspectiveStore, WorkspaceStore } from 'mailspring-exports';
import SearchStore from './search-store';
import SearchActions from './search-actions';
import TokenizingContenteditable from './tokenizing-contenteditable';

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

  async _generateSuggestionsForQuery(query) {
    const { token, term } = getCurrentTokenAndTerm(query, this._fieldEl.insertionIndex());
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
            })
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
            }))
          ),
          contacts: getContactSuggestions(query, accountIds).then(results =>
            results.map(term => ({ token: null, term: wrapInQuotes(term), description: term }))
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
        })
      );
    }

    if (promises.length) {
      await Promise.all(promises);
      this._setSuggestionState(suggestions);
    } else {
      this._setSuggestionState(suggestions);
    }
  }

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

    if (e.keyCode === 13) {
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
    const { index, length } = getCurrentTokenAndTerm(query, this._fieldEl.insertionIndex());

    let nextQuery = null;

    if (suggestion.token) {
      nextQuery = [
        query.substr(0, index),
        `${suggestion.token}:${suggestion.term}`,
        query.substr(index + length),
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
    SearchActions.queryChanged(query);
    if (query === '') {
      this._onClearSearchQuery();
    }
  };

  _setSuggestionState = suggestions => {
    const sameItemIdx = suggestions.findIndex(
      s => this.state.selected && s.description === this.state.selected.description
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
    SearchActions.querySubmitted(nextQuery);
    this._fieldEl.blur();
  };

  _onClearSearchQuery = () => {
    SearchActions.querySubmitted('');
  };

  _placeholder = () => {
    if (this.props.perspective.isInbox()) {
      return 'Search all email';
    }
    return `Search ${this.props.perspective.name || ''}`;
  };

  render() {
    const { query, isSearching, perspective } = this.props;
    const { suggestions, selectedIdx } = this.state;

    const showPlaceholder = !this.state.focused && !query;
    const showX = !!perspective.searchQuery;

    return (
      <div className={`thread-search-bar ${showPlaceholder ? 'placeholder' : ''}`}>
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
            onClick={() => this._fieldEl.focus()}
          />
        )}
        <TokenizingContenteditable
          ref={el => (this._fieldEl = el)}
          value={showPlaceholder ? this._placeholder() : query}
          onKeyDown={this._onKeyDown}
          onFocus={() => this.setState({ focused: true })}
          onBlur={() => this.setState({ focused: false })}
          onChange={this._onSearchQueryChanged}
        />
        {showX && (
          <RetinaImg
            name="searchclear.png"
            className="search-accessory clear"
            mode={RetinaImg.Mode.ContentDark}
            onClick={this._onClearSearchQuery}
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
                  {s.token && <span className="token">{s.token}: </span>}
                  {s.description}
                </div>
              ))}
              {suggestions === TokenSuggestionsForEmpty && (
                <div className="footer">
                  Pro tip: Combine search terms with AND and OR to create complex queries.{' '}
                  <a
                    onMouseDown={e => {
                      AppEnv.windowEventHandler.openLink({
                        href: LearnMoreURL,
                        metaKey: e.metaKey,
                      });
                      e.preventDefault();
                    }}
                  >
                    Learn more >
                  </a>
                </div>
              )}
            </div>
          )}
      </div>
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
