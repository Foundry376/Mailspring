import React from 'react';
import ReactTestUtils from 'react-dom/test-utils';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Rx, AttachmentStore, Event, File, Message } from 'mailspring-exports';
import { EventHeader, renderLocation } from '../lib/event-header';

// A LOCATION as Zoom rooms write it: the join URL, then the rooms booked for the meeting.
const ZOOM_WITH_ROOMS =
  'https://sequoia.zoom.us/j/7647885554, London-2-Oxford (7) [Zoom Room], MP2800-2-DuPont (7) [Zoom Room]';

type Link = React.ReactElement<{ href: string; children: string }>;

function linksIn(node: React.ReactNode): Array<{ href: string; text: string }> {
  return (Array.isArray(node) ? node : [node])
    .filter((n): n is Link => React.isValidElement(n))
    .map((n) => ({ href: n.props.href, text: n.props.children }));
}

function textOf(node: React.ReactNode): string {
  return (Array.isArray(node) ? node : [node])
    .map((n) => (React.isValidElement(n) ? (n as Link).props.children : n))
    .join('');
}

describe('EventHeader location', function () {
  it('links a join URL to itself', function () {
    const node = renderLocation('https://meet.google.com/abc-defg-hij');
    expect(linksIn(node)).toEqual([
      {
        href: 'https://meet.google.com/abc-defg-hij',
        text: 'https://meet.google.com/abc-defg-hij',
      },
    ]);
  });

  it('links only the URL when rooms follow it, and keeps the rooms as text', function () {
    const node = renderLocation(ZOOM_WITH_ROOMS);
    expect(linksIn(node)).toEqual([
      {
        href: 'https://sequoia.zoom.us/j/7647885554',
        text: 'https://sequoia.zoom.us/j/7647885554',
      },
    ]);
    expect(textOf(node)).toBe(ZOOM_WITH_ROOMS);
  });

  it('links a URL that comes after text', function () {
    const node = renderLocation('Dial in: see https://example.com/notes');
    expect(linksIn(node)).toEqual([
      { href: 'https://example.com/notes', text: 'https://example.com/notes' },
    ]);
    expect(textOf(node)).toBe('Dial in: see https://example.com/notes');
  });

  it('links a tel: URI the way the event card does', function () {
    const node = renderLocation('tel:+1-415-555-1234,,12345#, Boardroom');
    expect(linksIn(node)).toEqual([
      { href: 'tel:+1-415-555-1234,,12345#', text: 'tel:+1-415-555-1234,,12345#' },
    ]);
    expect(textOf(node)).toBe('tel:+1-415-555-1234,,12345#, Boardroom');
  });

  it('links a URL with tel: in its path once, as the URL', function () {
    const node = renderLocation('https://example.com/dial/tel:+15550100');
    expect(linksIn(node)).toEqual([
      {
        href: 'https://example.com/dial/tel:+15550100',
        text: 'https://example.com/dial/tel:+15550100',
      },
    ]);
  });

  it('leaves a room name as text', function () {
    expect(renderLocation('Conference Room 4B')).toBe('Conference Room 4B');
    expect(renderLocation('MP2800-2-DuPont (7) [Zoom Room]')).toBe(
      'MP2800-2-DuPont (7) [Zoom Room]'
    );
  });

  it('renders nothing for a missing location', function () {
    expect(renderLocation(undefined)).toBeNull();
    expect(renderLocation('')).toBeNull();
  });

  describe('rendered from an invitation attachment', function () {
    let icsPath: string;

    beforeEach(function () {
      icsPath = path.join(os.tmpdir(), `event-header-spec-${process.pid}.ics`);
      fs.writeFileSync(
        icsPath,
        [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Test//Test//EN',
          'METHOD:REQUEST',
          'BEGIN:VEVENT',
          'UID:zoom-rooms@test',
          'DTSTART:20260924T150000Z',
          'DTEND:20260924T153000Z',
          'SUMMARY:Planning',
          `LOCATION:${ZOOM_WITH_ROOMS.replace(/,/g, '\\,')}`,
          'DTSTAMP:20260901T000000Z',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n')
      );
      spyOn(AttachmentStore, 'pathForFile').andReturn(icsPath);
      spyOn(Rx.Observable, 'fromQuery').andReturn(Rx.Observable.empty());
    });

    afterEach(function () {
      fs.unlinkSync(icsPath);
    });

    it('shows the join URL as a link and the rooms as text', function () {
      const header = ReactTestUtils.renderIntoDocument(
        <EventHeader
          message={new Message({ accountId: 'a1' })}
          file={new File({ id: 'f1', filename: 'invite.ics' })}
        />
      ) as unknown as EventHeader;
      let location: HTMLElement;
      waitsFor(() => {
        const nodes = ReactTestUtils.scryRenderedDOMComponentsWithClass(header, 'event-location');
        location = nodes[0] as HTMLElement;
        return !!location;
      });
      runs(() => {
        const links = Array.from(location.querySelectorAll('a'));
        expect(links.map((a) => a.getAttribute('href'))).toEqual([
          'https://sequoia.zoom.us/j/7647885554',
        ]);
        expect(location.textContent).toBe(ZOOM_WITH_ROOMS);
      });
    });
  });
});

describe('EventHeader for an invitation to one occurrence of a series', function () {
  const vcalendar = (...vevents: string[][]) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      ...vevents.flatMap((lines) => [
        'BEGIN:VEVENT',
        'UID:huddle@test',
        ...lines,
        'DTSTAMP:20260901T000000Z',
        'END:VEVENT',
      ]),
      'END:VCALENDAR',
    ].join('\r\n');

  // A weekly Tuesday meeting since 2025. The email is about 15 September 2026, moved later.
  const SERIES = [
    'DTSTART:20250923T194500Z',
    'DTEND:20250923T200000Z',
    'RRULE:FREQ=WEEKLY',
    'SUMMARY:Huddle',
  ];
  const EMAILED = [
    'RECURRENCE-ID:20260915T194500Z',
    'DTSTART:20260915T213000Z',
    'DTEND:20260915T214500Z',
    'SUMMARY:Huddle',
  ];
  const SYNCED = [
    'RECURRENCE-ID:20260915T194500Z',
    'DTSTART:20260915T220000Z',
    'DTEND:20260915T221500Z',
    'SUMMARY:Huddle (as synced)',
  ];

  // Another moved week, listed first in the calendar copy.
  const OTHER_WEEK = [
    'RECURRENCE-ID:20260908T194500Z',
    'DTSTART:20260909T194500Z',
    'DTEND:20260909T200000Z',
    'SUMMARY:Huddle (another week)',
  ];

  let icsPath: string;

  function render(emailed: string[], calendarIcs: string) {
    icsPath = path.join(os.tmpdir(), `event-header-spec-${process.pid}.ics`);
    fs.writeFileSync(
      icsPath,
      vcalendar(emailed).replace('VERSION:2.0', 'VERSION:2.0\r\nMETHOD:REQUEST')
    );
    spyOn(AttachmentStore, 'pathForFile').andReturn(icsPath);
    spyOn(Rx.Observable, 'fromQuery').andReturn(
      Rx.Observable.just(new Event({ id: 'e1', accountId: 'a1', ics: calendarIcs } as any))
    );
    const header = ReactTestUtils.renderIntoDocument(
      <EventHeader
        message={new Message({ accountId: 'a1' })}
        file={new File({ id: 'f1', filename: 'invite.ics' })}
      />
    ) as unknown as EventHeader;
    const text = (className: string) =>
      ReactTestUtils.scryRenderedDOMComponentsWithClass(header, className)[0]?.textContent;
    // The link is rendered once the calendar copy has been applied.
    waitsFor(() => !!text('event-view-in-calendar'));
    return text;
  }

  afterEach(function () {
    fs.unlinkSync(icsPath);
  });

  it("shows that occurrence from the calendar copy, not the series' first date", function () {
    const text = render(EMAILED, vcalendar(SERIES, OTHER_WEEK, SYNCED));
    runs(() => {
      expect(text('event-day')).toBe('Tuesday, September 15th');
      expect(text('event-title')).toBe('Huddle (as synced)');
    });
  });

  it('keeps what the email said when the calendar copy has no entry for it', function () {
    const text = render(EMAILED, vcalendar(SERIES));
    runs(() => {
      expect(text('event-day')).toBe('Tuesday, September 15th');
      expect(text('event-title')).toBe('Huddle');
    });
  });

  it('still shows the calendar copy for an invitation to the whole series', function () {
    const text = render(SERIES, vcalendar([...SERIES.slice(0, 3), 'SUMMARY:Huddle (as synced)']));
    runs(() => {
      expect(text('event-day')).toBe('Tuesday, September 23rd');
      expect(text('event-title')).toBe('Huddle (as synced)');
    });
  });
});
