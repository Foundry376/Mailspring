import React, { Component } from 'react';
import { Event, DatabaseStore, localized } from 'mailspring-exports';
import { EventOccurrence, occurrencesForEvents } from './calendar-data-source';
import moment from 'moment';

interface EventSearchBarProps {
  disabledCalendars: string[];
  onSelectEvent: (event: EventOccurrence) => void;
}

export class EventSearchBar extends Component<
  EventSearchBarProps,
  { query: string; suggestions: EventOccurrence[] }
> {
  static displayName = 'EventSearchBar';

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
    let dbQuery = DatabaseStore.findAll<Event>(Event).distinct(); // eslint-disable-line
    if (disabledCalendars.length > 0) {
      dbQuery = dbQuery.where(Event.attributes.calendarId.notIn(disabledCalendars));
    }
    dbQuery
      .search(query)
      .limit(10)
      .then(events => {
        this.setState({
          suggestions: occurrencesForEvents(events, {
            startUnix: moment()
              .add(-2, 'years')
              .unix(),
            endUnix: moment()
              .add(2, 'years')
              .unix(),
          }),
        });
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
      this.props.onSelectEvent(event);
    });
  };

  renderEvent(event) {
    return event.title;
  }

  render() {
    const { query, suggestions } = this.state;

    // TODO BG
    return <span />;

    // return (
    //   <SearchBar
    //     query={query}
    //     suggestions={suggestions}
    //     placeholder={localized('Search all events')}
    //     suggestionKey={event => event.id}
    //     suggestionRenderer={this.renderEvent}
    //     onSearchQueryChanged={this.onSearchQueryChanged}
    //     onSelectSuggestion={this.onSelectEvent}
    //     onClearSearchQuery={this.onClearSearchQuery}
    //     onClearSearchSuggestions={this.onClearSearchSuggestions}
    //   />
    // );
  }
}
