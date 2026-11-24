import moment from 'moment';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  Account,
  AccountStore,
  Actions,
  Calendar,
  DatabaseStore,
  Event,
  ICSEventHelpers,
  SyncbackEventTask,
  TaskQueue,
} from 'mailspring-exports';
import { registerTools, clearAuditLog, getAuditLog } from '../lib/mcp-tools';

const family = new Calendar({ id: 'cal-family', accountId: 'acc-1', name: 'Family' } as any);
const holidays = new Calendar({
  id: 'cal-holidays',
  accountId: 'acc-1',
  name: 'Holidays',
  readOnly: true,
} as any);
const work = new Calendar({ id: 'cal-work', accountId: 'acc-2', name: 'Work' } as any);
const calendars = [family, holidays, work];

function eventRow(id: string, calendarId: string, fields: Record<string, any>) {
  const icsuid = `${id}@example.com`;
  const ics = ICSEventHelpers.createICSString({ uid: icsuid, timezone: 'UTC', ...fields } as any);
  return new Event({
    id,
    accountId: calendars.find((c) => c.id === calendarId).accountId,
    calendarId,
    ics,
    icsuid,
    recurrenceId: '',
    recurrenceStart: Math.floor(fields.start.getTime() / 1000),
    recurrenceEnd: fields.recurrenceRule
      ? Math.floor(new Date('2027-12-31').getTime() / 1000)
      : Math.floor(fields.end.getTime() / 1000),
  } as any);
}

// A stand-in for ModelQuery: chainable `where`, awaitable, and honoring the plain-object
// form so `where({ accountId })` really narrows what the tool sees.
function fakeQuery(rows: any[], wheres: any[]) {
  let result = rows;
  const query: any = {
    where: (arg: any) => {
      wheres.push(arg);
      if (arg && arg.constructor === Object) {
        result = result.filter((r) => Object.keys(arg).every((k) => r[k] === arg[k]));
      }
      return query;
    },
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

const unfold = (ics: string) => ics.replace(/\r?\n /g, '');

describe('MCP calendar tools', function () {
  beforeEach(function () {
    AppEnv.config.set('core.mcp.accessLevel', 'read-write');
    AppEnv.config.set('core.mcp.enabledAccounts', {});

    this.events = [];
    this.wheres = [];
    spyOn(DatabaseStore, 'findAll').andCallFake((klass) =>
      fakeQuery(klass === Calendar ? calendars : this.events, this.wheres)
    );
    spyOn(DatabaseStore, 'find').andCallFake((klass, id) =>
      Promise.resolve(calendars.find((c) => c.id === id) || null)
    );
    spyOn(AccountStore, 'accountForId').andReturn(
      new Account({ id: 'acc-1', emailAddress: 'me@example.com', name: 'Me' } as any)
    );

    this.queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => this.queued.push(task));
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(
      Promise.resolve({ error: null, event: { id: 'ev-new' } })
    );

    this.server = new McpServer({ name: 'mailspring-spec', version: '0.0.1' });
    registerTools(this.server);
    this.client = new Client({ name: 'mcp-calendar-tools-spec', version: '0.0.1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    waitsForPromise(() =>
      Promise.all([this.server.connect(serverTransport), this.client.connect(clientTransport)])
    );
  });

  afterEach(function () {
    clearAuditLog();
    waitsForPromise(() => this.client.close());
  });

  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result: any = await client.callTool({ name, arguments: args });
    return JSON.parse(result.content[0].text);
  };

  describe('list_calendars', function () {
    it('lists calendars with their account and whether they are read-only', function () {
      waitsForPromise(async () => {
        const result = await call(this.client, 'list_calendars', {});
        expect(result).toEqual([
          {
            id: 'cal-family',
            name: 'Family',
            description: null,
            accountId: 'acc-1',
            readOnly: false,
          },
          {
            id: 'cal-holidays',
            name: 'Holidays',
            description: null,
            accountId: 'acc-1',
            readOnly: true,
          },
          { id: 'cal-work', name: 'Work', description: null, accountId: 'acc-2', readOnly: false },
        ]);
      });
    });

    it('narrows to one account', function () {
      waitsForPromise(async () => {
        const result = await call(this.client, 'list_calendars', { accountId: 'acc-2' });
        expect(result.map((c) => c.id)).toEqual(['cal-work']);
      });
    });

    it('leaves out calendars on accounts MCP may not see', function () {
      AppEnv.config.set('core.mcp.enabledAccounts', {
        'acc-1': { enabled: true },
        'acc-2': { enabled: false },
      });
      waitsForPromise(async () => {
        const result = await call(this.client, 'list_calendars', {});
        expect(result.map((c) => c.id)).toEqual(['cal-family', 'cal-holidays']);
        const scoped = await call(this.client, 'list_calendars', { accountId: 'acc-2' });
        expect(scoped.error).toContain('not enabled for MCP access');
      });
    });
  });

  describe('list_events', function () {
    it('expands a recurring event into its occurrences in the range, in order', function () {
      this.events = [
        eventRow('ev-swim', 'cal-family', {
          summary: 'Swimming',
          start: new Date('2026-12-02T15:00:00Z'),
          end: new Date('2026-12-02T16:00:00Z'),
          recurrenceRule: 'FREQ=WEEKLY;COUNT=10',
        }),
        eventRow('ev-dentist', 'cal-family', {
          summary: 'Dentist',
          start: new Date('2026-12-03T09:00:00Z'),
          end: new Date('2026-12-03T09:30:00Z'),
          location: 'Clinic',
        }),
      ];
      waitsForPromise(async () => {
        const result = await call(this.client, 'list_events', {
          calendarId: 'cal-family',
          start: '2026-12-01T00:00:00Z',
          end: '2026-12-15T00:00:00Z',
        });
        expect(result.map((e) => [e.title, e.start])).toEqual([
          ['Swimming', moment('2026-12-02T15:00:00Z').format()],
          ['Dentist', moment('2026-12-03T09:00:00Z').format()],
          ['Swimming', moment('2026-12-09T15:00:00Z').format()],
        ]);
        const [swim, dentist] = result;
        expect(swim.eventId).toBe('ev-swim');
        expect(swim.isRecurring).toBe(true);
        expect(swim.status).toBe('confirmed');
        expect(dentist.location).toBe('Clinic');
        expect(dentist.end).toBe(moment('2026-12-03T09:30:00Z').format());
        expect(this.wheres).toContain({ calendarId: 'cal-family' });
      });
    });

    it('gives all-day events as dates with an exclusive end', function () {
      this.events = [
        eventRow('ev-trip', 'cal-family', {
          summary: 'Trip',
          start: new Date(2026, 11, 20),
          end: new Date(2026, 11, 23),
          isAllDay: true,
        }),
      ];
      waitsForPromise(async () => {
        const [trip] = await call(this.client, 'list_events', {
          calendarId: 'cal-family',
          start: '2026-12-01',
          end: '2027-01-01',
        });
        expect(trip.isAllDay).toBe(true);
        expect(trip.start).toBe('2026-12-20');
        expect(trip.end).toBe('2026-12-23');
      });
    });

    it('treats a calendar on an excluded account as missing', function () {
      AppEnv.config.set('core.mcp.enabledAccounts', {
        'acc-1': { enabled: true },
        'acc-2': { enabled: false },
      });
      waitsForPromise(async () => {
        const result = await call(this.client, 'list_events', {
          calendarId: 'cal-work',
          start: '2026-12-01',
          end: '2026-12-31',
        });
        expect(result.error).toBe("Calendar 'cal-work' not found");
      });
    });

    it('rejects an inverted, unreadable or overlong range', function () {
      waitsForPromise(async () => {
        const args = { calendarId: 'cal-family' };
        const inverted = await call(this.client, 'list_events', {
          ...args,
          start: '2026-12-10',
          end: '2026-12-01',
        });
        expect(inverted.error).toBe('end must be after start');
        const unreadable = await call(this.client, 'list_events', {
          ...args,
          start: 'next tuesday',
          end: '2026-12-01',
        });
        expect(unreadable.error).toContain('ISO 8601');
        const overlong = await call(this.client, 'list_events', {
          ...args,
          start: '2026-01-01',
          end: '2028-01-01',
        });
        expect(overlong.error).toContain('at most 400 days');
      });
    });
  });

  describe('create_event', function () {
    it('queues the calendar task with the event as ICS and returns the new event', function () {
      waitsForPromise(async () => {
        const result = await call(this.client, 'create_event', {
          calendarId: 'cal-family',
          title: 'Parents meeting',
          start: '2026-12-04T18:00:00',
          end: '2026-12-04T19:00:00',
          location: 'School',
          description: 'Room 12',
        });
        expect(this.queued.length).toBe(1);
        const task = this.queued[0];
        expect(task instanceof SyncbackEventTask).toBe(true);
        expect(task.calendarId).toBe('cal-family');
        expect(task.accountId).toBe('acc-1');
        const ics = unfold(task.event.ics);
        expect(ics).toContain('SUMMARY:Parents meeting');
        expect(ics).toContain('LOCATION:School');
        expect(ics).toContain('DESCRIPTION:Room 12');
        expect(ics).not.toContain('ATTENDEE');

        expect(result.eventId).toBe('ev-new');
        expect(result.icsuid).toBe(task.event.icsuid);
        expect(result.title).toBe('Parents meeting');
        expect(result.start).toBe(moment('2026-12-04T18:00:00').format());
        expect(result.end).toBe(moment('2026-12-04T19:00:00').format());
        expect(result.isAllDay).toBe(false);
      });
    });

    it('makes an all-day event from dates, a single date covering that one day', function () {
      waitsForPromise(async () => {
        const result = await call(this.client, 'create_event', {
          calendarId: 'cal-family',
          title: 'Birthday',
          start: '2026-12-17',
          end: '2026-12-17',
        });
        const ics = this.queued[0].event.ics;
        expect(ics).toContain('DTSTART;VALUE=DATE:20261217');
        expect(ics).toContain('DTEND;VALUE=DATE:20261218');
        expect(result.isAllDay).toBe(true);
        expect(result.start).toBe('2026-12-17');
        expect(result.end).toBe('2026-12-18');
      });
    });

    it('refuses read-only calendars and calendars MCP may not see', function () {
      AppEnv.config.set('core.mcp.enabledAccounts', {
        'acc-1': { enabled: true },
        'acc-2': { enabled: false },
      });
      waitsForPromise(async () => {
        const args = { title: 'X', start: '2026-12-04T18:00', end: '2026-12-04T19:00' };
        const readOnly = await call(this.client, 'create_event', {
          ...args,
          calendarId: 'cal-holidays',
        });
        expect(readOnly.error).toContain('read-only');
        const hidden = await call(this.client, 'create_event', { ...args, calendarId: 'cal-work' });
        expect(hidden.error).toBe("Calendar 'cal-work' not found");
        expect(this.queued.length).toBe(0);
      });
    });

    it('rejects a timed event that ends before it starts', function () {
      waitsForPromise(async () => {
        const result = await call(this.client, 'create_event', {
          calendarId: 'cal-family',
          title: 'X',
          start: '2026-12-04T18:00',
          end: '2026-12-04T18:00',
        });
        expect(result.error).toBe('end must be after start');
        expect(this.queued.length).toBe(0);
      });
    });

    it('reports a failure the sync engine records while creating it', function () {
      jasmine.unspy(TaskQueue, 'waitForPerformLocal');
      spyOn(TaskQueue, 'waitForPerformLocal').andReturn(
        Promise.resolve({ error: { key: 'no-calendar' }, event: {} })
      );
      waitsForPromise(async () => {
        const result = await call(this.client, 'create_event', {
          calendarId: 'cal-family',
          title: 'X',
          start: '2026-12-04T18:00',
          end: '2026-12-04T19:00',
        });
        expect(result.error).toContain('no-calendar');
      });
    });

    it('is a write: refused at Read Only, and recorded in the activity log', function () {
      AppEnv.config.set('core.mcp.accessLevel', 'read-only');
      waitsForPromise(async () => {
        const result = await call(this.client, 'create_event', {
          calendarId: 'cal-family',
          title: 'X',
          start: '2026-12-04T18:00',
          end: '2026-12-04T19:00',
        });
        expect(result.error).toContain("'write' operations require");
        expect(this.queued.length).toBe(0);
        expect(getAuditLog().map((e) => e.toolName)).toContain('create_event');

        const listed = await call(this.client, 'list_calendars', {});
        expect(listed.length).toBe(3);
      });
    });
  });
});
