import React, { Component } from 'react';
import moment from 'moment-timezone';
import { Event, DatabaseStore, localized, Calendar } from 'mailspring-exports';
import { Menu, RetinaImg } from 'mailspring-component-kit';
import { EventOccurrence, occurrencesForEvents } from './calendar-data-source';

interface EventSearchBarProps {
  disabledCalendars: string[];
  onSelectEvent: (event: EventOccurrence) => void;
}

interface EventSearchBarState {
  query: string;
  suggestions: EventOccurrence[];
  calendars: Map<string, Calendar>;
  focused: boolean;
  loading: boolean;
}

export class EventSearchBar extends Component<EventSearchBarProps, EventSearchBarState> {
  static displayName = 'EventSearchBar';

  private _searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private _inputRef = React.createRef<HTMLInputElement>();
  private _menuRef = React.createRef<Menu>();

  constructor(props: EventSearchBarProps) {
    super(props);
    this.state = {
      query: '',
      suggestions: [],
      calendars: new Map(),
      focused: false,
      loading: false,
    };
  }

  componentDidMount() {
    this._loadCalendars();
  }

  componentWillUnmount() {
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
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
    this.setState({ query });
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
    const { disabledCalendars } = this.props;

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
      });
    } catch (error) {
      console.error('Event search error:', error);
      this.setState({ suggestions: [], loading: false });
    }
  };

  _onClearSearch = () => {
    this.setState({ query: '', suggestions: [] });
    this._inputRef.current?.focus();
  };

  _onSelectEvent = (event: EventOccurrence) => {
    this.setState({ query: '', suggestions: [], focused: false });
    setImmediate(() => {
      this.props.onSelectEvent(event);
    });
  };

  _onFocus = () => {
    this.setState({ focused: true });
  };

  _onBlur = (e: React.FocusEvent) => {
    // Delay blur to allow menu item clicks to register
    setTimeout(() => {
      this.setState({ focused: false });
    }, 150);
  };

  _onKeyDown = (e: React.KeyboardEvent) => {
    const { suggestions } = this.state;

    if (suggestions.length === 0) {
      if (e.key === 'Escape') {
        this._onClearSearch();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._menuRef.current?.setSelectedIndex(
          Math.min(
            (this._menuRef.current?.getSelectedIndex?.() ?? -1) + 1,
            suggestions.length - 1
          )
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._menuRef.current?.setSelectedIndex(
          Math.max((this._menuRef.current?.getSelectedIndex?.() ?? 0) - 1, 0)
        );
        break;
      case 'Enter':
        e.preventDefault();
        const selectedItem = this._menuRef.current?.getSelectedItem?.();
        if (selectedItem) {
          this._onSelectEvent(selectedItem);
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
      return `${start.format('ddd, MMM D')} at ${start.format('h:mm A')} - ${end.format('h:mm A')}`;
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

  _renderEventItem = (event: EventOccurrence) => {
    const color = this._getCalendarColor(event.calendarId);

    return (
      <div className="event-search-item">
        <div className="event-search-item-header">
          <span className="event-search-calendar-dot" style={{ backgroundColor: color }} />
          <span className="event-search-item-title">{event.title || localized('(No title)')}</span>
        </div>
        <div className="event-search-item-time">{this._formatEventTime(event)}</div>
        {event.location && (
          <div className="event-search-item-location">{event.location}</div>
        )}
      </div>
    );
  };

  render() {
    const { query, suggestions, focused, loading } = this.state;
    const showDropdown = focused && (suggestions.length > 0 || (query.length > 1 && !loading));

    return (
      <div className="event-search-bar">
        <div className="event-search-input-container">
          <RetinaImg
            className="event-search-icon"
            name="searchloupe.png"
            mode={RetinaImg.Mode.ContentDark}
          />
          <input
            ref={this._inputRef}
            type="text"
            className="event-search-input"
            placeholder={localized('Search events...')}
            value={query}
            onChange={this._onInputChange}
            onFocus={this._onFocus}
            onBlur={this._onBlur}
            onKeyDown={this._onKeyDown}
          />
          {query && (
            <button
              className="event-search-clear"
              onClick={this._onClearSearch}
              tabIndex={-1}
            >
              <RetinaImg
                name="clear-search.svg"
                style={{ width: 16, height: 16 }}
                mode={RetinaImg.Mode.ContentIsMask}
              />
            </button>
          )}
          {loading && <div className="event-search-loading" />}
        </div>

        {showDropdown && (
          <div className="event-search-suggestions">
            {suggestions.length > 0 ? (
              <Menu
                ref={this._menuRef as any}
                items={suggestions}
                itemKey={(event: EventOccurrence) => event.id}
                itemContent={this._renderEventItem}
                onSelect={this._onSelectEvent}
                onEscape={this._onClearSearch}
                onExpand={() => {}}
                defaultSelectedIndex={0}
              />
            ) : (
              <div className="event-search-no-results">
                {localized('No events found for "%@"', query)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
