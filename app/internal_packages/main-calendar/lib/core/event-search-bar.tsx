import React, { Component } from 'react';
import moment from 'moment-timezone';
import { Rx, Event, DatabaseStore, localized, Calendar, Actions } from 'mailspring-exports';
import { RetinaImg, KeyCommandsRegion } from 'mailspring-component-kit';
import { EventOccurrence, occurrencesForEvents } from './calendar-data-source';
import { Disposable } from 'rx-core';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

interface EventSearchBarState {
  query: string;
  suggestions: EventOccurrence[];
  calendars: Map<string, Calendar>;
  disabledCalendars: string[];
  focused: boolean;
  selectedIdx: number;
  loading: boolean;
}

export class EventSearchBar extends Component<Record<string, unknown>, EventSearchBarState> {
  static displayName = 'EventSearchBar';

  private _searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private _inputRef = React.createRef<HTMLInputElement>();
  private _disposable?: Disposable;

  constructor(props: Record<string, unknown>) {
    super(props);
    this.state = {
      query: '',
      suggestions: [],
      calendars: new Map(),
      disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
      focused: false,
      selectedIdx: -1,
      loading: false,
    };
  }

  componentDidMount() {
    this._loadCalendars();
    this._disposable = Rx.Observable.fromConfig<string[] | undefined>(DISABLED_CALENDARS).subscribe(
      disabledCalendars => {
        this.setState({ disabledCalendars: disabledCalendars || [] });
      }
    );
  }

  componentWillUnmount() {
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }
    if (this._disposable) {
      this._disposable.dispose();
    }
  }

  _loadCalendars = async () => {
    const calendars = await DatabaseStore.findAll<Calendar>(Calendar);
    const calendarMap = new Map<string, Calendar>();
    calendars.forEach(cal => calendarMap.set(cal.id, cal));
    this.setState({ calendars: calendarMap });
  };

  _onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    this.setState({ query, selectedIdx: -1 });
    this._debouncedSearch(query);
  };

  _debouncedSearch = (query: string) => {
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }

    if (query.length <= 1) {
      this.setState({ suggestions: [], loading: false });
      return;
    }

    this.setState({ loading: true });

    this._searchTimeout = setTimeout(() => {
      this._performSearch(query);
    }, 300);
  };

  _performSearch = async (query: string) => {
    const { disabledCalendars } = this.state;

    try {
      let dbQuery = DatabaseStore.findAll<Event>(Event).distinct();

      if (disabledCalendars.length > 0) {
        dbQuery = dbQuery.where(Event.attributes.calendarId.notIn(disabledCalendars));
      }

      const events = await dbQuery.search(query).limit(10);

      // Expand events to occurrences within a wide time range
      const suggestions = occurrencesForEvents(events, {
        startUnix: moment().add(-2, 'years').unix(),
        endUnix: moment().add(2, 'years').unix(),
      });

      // Sort by start date, closest to now first
      const now = moment().unix();
      suggestions.sort((a, b) => {
        const aDiff = Math.abs(a.start - now);
        const bDiff = Math.abs(b.start - now);
        return aDiff - bDiff;
      });

      // Limit to 10 suggestions
      this.setState({
        suggestions: suggestions.slice(0, 10),
        loading: false,
        selectedIdx: suggestions.length > 0 ? 0 : -1,
      });
    } catch (error) {
      console.error('Event search error:', error);
      this.setState({ suggestions: [], loading: false });
    }
  };

  _onClearSearch = () => {
    this.setState({ query: '', suggestions: [], selectedIdx: -1 });
    this._inputRef.current?.focus();
  };

  _onSelectEvent = (event: EventOccurrence) => {
    this.setState({ query: '', suggestions: [], focused: false, selectedIdx: -1 });
    Actions.focusCalendarEvent(event);
  };

  _onFocus = () => {
    this.setState({ focused: true });
  };

  _onBlur = () => {
    // Delay blur to allow suggestion clicks to register
    setTimeout(() => {
      this.setState({ focused: false });
    }, 150);
  };

  _onKeyDown = (e: React.KeyboardEvent) => {
    const { suggestions, selectedIdx } = this.state;

    if (suggestions.length === 0) {
      if (e.key === 'Escape') {
        this._onClearSearch();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.setState({
          selectedIdx: Math.min(selectedIdx + 1, suggestions.length - 1),
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.setState({
          selectedIdx: Math.max(selectedIdx - 1, 0),
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIdx >= 0 && selectedIdx < suggestions.length) {
          this._onSelectEvent(suggestions[selectedIdx]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        this._onClearSearch();
        break;
    }
  };

  _formatEventTime = (event: EventOccurrence) => {
    const start = moment(event.start * 1000);
    const end = moment(event.end * 1000);

    if (event.isAllDay) {
      if (start.isSame(end, 'day') || end.diff(start, 'hours') <= 24) {
        return start.format('ddd, MMM D, YYYY');
      }
      return `${start.format('MMM D')} - ${end.format('MMM D, YYYY')}`;
    }

    if (start.isSame(end, 'day')) {
      return `${start.format('ddd, MMM D')} \u00B7 ${start.format('h:mm A')} - ${end.format('h:mm A')}`;
    }

    return `${start.format('MMM D, h:mm A')} - ${end.format('MMM D, h:mm A')}`;
  };

  _getCalendarColor = (calendarId: string): string => {
    const calendar = this.state.calendars.get(calendarId);
    if (!calendar) return '#8e44ad'; // Default purple

    // Use a hash of the calendar name to generate a consistent color
    const colors = [
      '#e74c3c', // red
      '#e67e22', // orange
      '#f1c40f', // yellow
      '#27ae60', // green
      '#3498db', // blue
      '#9b59b6', // purple
      '#1abc9c', // teal
      '#e91e63', // pink
    ];

    let hash = 0;
    const name = calendar.name || calendar.id;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  render() {
    const { query, suggestions, focused, selectedIdx, loading } = this.state;
    const showPlaceholder = !focused && query.length === 0;
    const showX = query.length > 0 && focused;

    return (
      <KeyCommandsRegion className={`event-search-bar ${focused ? 'focused' : ''}`} tabIndex={-1}>
        {loading ? (
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
            onClick={() => this._inputRef.current?.focus()}
          />
        )}
        <input
          ref={this._inputRef}
          type="text"
          className="event-search-input"
          placeholder={showPlaceholder ? localized('Search events') : ''}
          value={query}
          onChange={this._onInputChange}
          onFocus={this._onFocus}
          onBlur={this._onBlur}
          onKeyDown={this._onKeyDown}
        />
        {showX && (
          <RetinaImg
            name="searchclear.png"
            className="search-accessory clear"
            mode={RetinaImg.Mode.ContentDark}
            onMouseDown={this._onClearSearch}
          />
        )}
        {suggestions.length > 0 && focused && (
          <div className="suggestions">
            {suggestions.map((event, idx) => {
              const color = this._getCalendarColor(event.calendarId);
              return (
                <div
                  key={event.id}
                  className={`suggestion ${selectedIdx === idx ? 'selected' : ''}`}
                  onMouseDown={e => {
                    this._onSelectEvent(event);
                    e.preventDefault();
                  }}
                >
                  <span className="suggestion-calendar-dot" style={{ backgroundColor: color }} />
                  <span className="suggestion-content">
                    <span className="suggestion-title">
                      {event.title || localized('(No title)')}
                    </span>
                    <span className="suggestion-time">{this._formatEventTime(event)}</span>
                    {event.location && (
                      <span className="suggestion-location">{event.location}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </KeyCommandsRegion>
    );
  }
}
