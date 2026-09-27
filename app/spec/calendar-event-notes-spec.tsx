import http from 'http';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

import { CalendarEventPopover } from '../internal_packages/main-calendar/lib/core/calendar-event-popover';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

function renderCard(description: string) {
  const event = {
    id: 'event-1-e0',
    accountId: 'account-1',
    calendarId: 'calendar-1',
    title: 'Weekly sync',
    location: '',
    description,
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    organizer: null,
    attendees: [],
    start: 1773154800,
    end: 1773158400,
  } as TimedOccurrence;
  const { container } = render(<CalendarEventPopover event={event} />);
  return container.querySelector('.description .label').nextElementSibling.textContent;
}

describe('the notes on an event card', function () {
  afterEach(() => cleanup());

  it('keeps each line of a description written as <br>-separated HTML', function () {
    // The shape Google writes; innerText on a detached element ran the lines together.
    expect(renderCard('What happened last week?<br>What is the plan?<br><br>Keep it short.')).toBe(
      'What happened last week?\nWhat is the plan?\nKeep it short.'
    );
  });

  it('reads a plain-text description as it was', function () {
    expect(renderCard('Line one\nLine two')).toBe('Line one\nLine two');
  });

  describe('an image in the description', function () {
    let server: http.Server;
    let requested: string[];
    let origin: string;

    beforeEach(function () {
      requested = [];
      server = http.createServer((req, res) => {
        requested.push(req.url);
        res.writeHead(404);
        res.end();
      });
      let listening = false;
      server.listen(0, '127.0.0.1', () => {
        origin = `http://127.0.0.1:${(server.address() as any).port}`;
        listening = true;
      });
      waitsFor(() => listening, 'the local server to listen', 2000);
    });

    afterEach(function () {
      server.close();
    });

    it('is never fetched', function () {
      runs(() => {
        expect(renderCard(`Agenda <img src="${origin}/from-description.gif">`)).toBe('Agenda ');
        // Requested after the card, from the same server: once it arrives, so would the other.
        new Image().src = `${origin}/control.gif`;
      });
      waitsFor(() => requested.includes('/control.gif'), 'the control image request', 2000);
      runs(() => expect(requested).not.toContain('/from-description.gif'));
    });
  });
});
