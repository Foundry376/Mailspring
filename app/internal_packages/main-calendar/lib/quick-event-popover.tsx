import React from 'react';
import moment from 'moment';
import { Actions, DateUtils, localized } from 'mailspring-exports';
import { formatShortTimeRange } from './core/calendar-helpers';
import { ClearButton } from './core/clear-button';

type ParsedEvent = ReturnType<typeof DateUtils.parseDateString>;

/** Opens the quick add under `anchor`, as New Event and the agenda's + do. */
export function openQuickEventPopover(anchor: HTMLElement) {
  Actions.openPopover(<QuickEventPopover />, {
    originRect: anchor.getBoundingClientRect(),
    direction: 'down',
  });
}

/** The slot Enter would create, as the footer reads it: "Fri, Sep 18 · 12–1PM · Enter to add". */
export function quickEventReading({ start, end }: ParsedEvent) {
  const day = start.isSame(moment(), 'day') ? localized('Today') : start.format('ddd, MMM D');
  return localized(
    '%1$@ · %2$@ · Enter to add',
    day,
    formatShortTimeRange(start.unix(), end.unix())
  );
}

interface QuickEventPopoverState {
  text: string;
  parsed: ParsedEvent | null;
}

export class QuickEventPopover extends React.Component<
  Record<string, unknown>,
  QuickEventPopoverState
> {
  state: QuickEventPopoverState = { text: '', parsed: null };

  // Opens what the footer reads in the event panel, rather than parsing again a minute later.
  onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const { parsed } = this.state;
    if (parsed && ['Enter', 'Return'].includes(event.key)) {
      event.stopPropagation();
      Actions.closePopover();
      Actions.openNewCalendarEvent({
        title: parsed.leftoverText,
        start: parsed.start.unix(),
        end: parsed.end.unix(),
      });
    }
  };

  onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    this.setState({ text, parsed: text.trim() ? DateUtils.parseDateString(text) : null });
  };

  onClear = () => {
    this.setState({ text: '', parsed: null });
  };

  render() {
    const { text, parsed } = this.state;
    return (
      <div className="quick-event-popover">
        <div className="quick-event-popover-field">
          <input
            tabIndex={0}
            type="text"
            value={text}
            aria-label={localized('Quick add')}
            placeholder={localized('Coffee next Monday at 9AM')}
            onKeyDown={this.onInputKeyDown}
            onChange={this.onInputChange}
          />
          {text && <ClearButton onClear={this.onClear} />}
        </div>
        <div className="quick-event-popover-hint">
          {parsed ? quickEventReading(parsed) : localized('Enter to add · Esc to close')}
        </div>
      </div>
    );
  }
}
