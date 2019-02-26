import React, { Component } from 'react';
import { Event, DatabaseStore } from 'mailspring-exports';
import { SearchBar } from 'mailspring-component-kit';
import PropTypes from 'prop-types';

class EventSearchBar extends Component {
  static displayName = 'EventSearchBar';

  static propTypes = {
    disabledCalendars: PropTypes.array,
    onSelectEvent: PropTypes.func,
  };

  static defaultProps = {
    disabledCalendars: [],
    onSelectEvent: () => {},
  };

  constructor(props) {
    super(props);
    this.state = {
      query: '',
      suggestions: [],
    };
  }

  onSearchQueryChanged = query => {
    const { disabledCalendars } = this.props;
    this.setState({ query });
    if (query.length <= 1) {
      this.onClearSearchSuggestions();
      return;
    }
    let dbQuery = DatabaseStore.findAll(Event).distinct(); // eslint-disable-line
    if (disabledCalendars.length > 0) {
      dbQuery = dbQuery.where(Event.attributes.calendarId.notIn(disabledCalendars));
    }
    dbQuery = dbQuery
      .search(query)
      .limit(10)
      .then(events => {
        this.setState({ suggestions: events });
      });
  };

  onClearSearchQuery = () => {
    this.setState({ query: '', suggestions: [] });
  };

  onClearSearchSuggestions = () => {
    this.setState({ suggestions: [] });
  };

  onSelectEvent = event => {
    this.onClearSearchQuery();
    setImmediate(() => {
      const { onSelectEvent } = this.props;
      onSelectEvent(event);
    });
  };

  renderEvent(event) {
    return event.title;
  }

  render() {
    const { query, suggestions } = this.state;

    // TODO BG
    return <span />;

    return (
      <SearchBar
        query={query}
        suggestions={suggestions}
        placeholder="Search all events"
        suggestionKey={event => event.id}
        suggestionRenderer={this.renderEvent}
        onSearchQueryChanged={this.onSearchQueryChanged}
        onSelectSuggestion={this.onSelectEvent}
        onClearSearchQuery={this.onClearSearchQuery}
        onClearSearchSuggestions={this.onClearSearchSuggestions}
      />
    );
  }
}

export default EventSearchBar;
