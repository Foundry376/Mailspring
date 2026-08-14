import fs from 'fs';
import path from 'path';
import {
  Actions,
  DatabaseStore,
  Message,
  TaskQueue,
  GetMessageRFC2822Task,
} from 'mailspring-exports';
import {
  defaultEmlFilename,
  newestExportableMessagesForThreadIds,
  stageMessagesAsEml,
} from '../../src/services/eml-utils';

describe('defaultEmlFilename', function () {
  describe('normal subjects', () => {
    it('appends .eml to a simple subject', () => {
      expect(defaultEmlFilename('Hello World')).toEqual('Hello World.eml');
    });

    it('preserves alphanumeric characters and spaces', () => {
      expect(defaultEmlFilename('Meeting Notes 2024')).toEqual('Meeting Notes 2024.eml');
    });
  });

  describe('empty and falsy inputs', () => {
    it('returns untitled.eml for an empty string', () => {
      expect(defaultEmlFilename('')).toEqual('untitled.eml');
    });

    it('returns untitled.eml for a null value', () => {
      expect(defaultEmlFilename(null as any)).toEqual('untitled.eml');
    });

    it('returns untitled.eml for an undefined value', () => {
      expect(defaultEmlFilename(undefined as any)).toEqual('untitled.eml');
    });

    it('returns untitled.eml for a whitespace-only string', () => {
      expect(defaultEmlFilename('   ')).toEqual('untitled.eml');
    });

    it('returns untitled.eml for a tab-only string', () => {
      expect(defaultEmlFilename('\t\t')).toEqual('untitled.eml');
    });
  });

  describe('length truncation', () => {
    it('does not truncate a subject of exactly 80 characters', () => {
      const subject = 'a'.repeat(80);
      expect(defaultEmlFilename(subject)).toEqual(`${subject}.eml`);
    });

    it('truncates a subject longer than 80 characters to 80 characters', () => {
      const subject = 'b'.repeat(100);
      const result = defaultEmlFilename(subject);
      // The base name (without .eml) should be 80 chars
      expect(result).toEqual(`${'b'.repeat(80)}.eml`);
    });

    it('truncates a very long subject and still appends .eml', () => {
      const subject = 'Re: ' + 'x'.repeat(200);
      const result = defaultEmlFilename(subject);
      expect(result.length).toEqual(80 + '.eml'.length);
      expect(result.endsWith('.eml')).toBe(true);
    });
  });

  describe('unsafe character replacement', () => {
    it('replaces forward slash with underscore', () => {
      expect(defaultEmlFilename('path/to/file')).toEqual('path_to_file.eml');
    });

    it('replaces question mark with underscore', () => {
      expect(defaultEmlFilename('What?')).toEqual('What_.eml');
    });

    it('replaces less-than sign with underscore', () => {
      expect(defaultEmlFilename('a<b')).toEqual('a_b.eml');
    });

    it('replaces greater-than sign with underscore', () => {
      expect(defaultEmlFilename('a>b')).toEqual('a_b.eml');
    });

    it('replaces backslash with underscore', () => {
      expect(defaultEmlFilename('C:\\Users\\file')).toEqual('C__Users_file.eml');
    });

    it('replaces colon with underscore', () => {
      expect(defaultEmlFilename('Re: Hello')).toEqual('Re_ Hello.eml');
    });

    it('replaces asterisk with underscore', () => {
      expect(defaultEmlFilename('Note *important*')).toEqual('Note _important_.eml');
    });

    it('replaces pipe with underscore', () => {
      expect(defaultEmlFilename('a|b')).toEqual('a_b.eml');
    });

    it('replaces double-quote with underscore', () => {
      expect(defaultEmlFilename('"Quoted Subject"')).toEqual('_Quoted Subject_.eml');
    });

    it('replaces multiple unsafe characters in one subject', () => {
      expect(defaultEmlFilename('Re: <bold> "hello"')).toEqual('Re_ _bold_ _hello_.eml');
    });
  });

  describe('control character stripping', () => {
    it('strips null byte (U+0000)', () => {
      expect(defaultEmlFilename('hello\u0000world')).toEqual('helloworld.eml');
    });

    it('strips newline (U+000A)', () => {
      expect(defaultEmlFilename('line1\nline2')).toEqual('line1line2.eml');
    });

    it('strips carriage return (U+000D)', () => {
      expect(defaultEmlFilename('line1\rline2')).toEqual('line1line2.eml');
    });

    it('strips DEL character (U+007F)', () => {
      expect(defaultEmlFilename('hello\u007fworld')).toEqual('helloworld.eml');
    });

    it('strips all C0 control characters', () => {
      // Build a string with chars 0x01–0x1F between "a" and "b"
      const controls = Array.from({ length: 31 }, (_, i) => String.fromCharCode(i + 1)).join('');
      expect(defaultEmlFilename(`a${controls}b`)).toEqual('ab.eml');
    });
  });

  describe('trailing dots and whitespace removal', () => {
    it('removes a trailing dot', () => {
      expect(defaultEmlFilename('Subject.')).toEqual('Subject.eml');
    });

    it('removes multiple trailing dots', () => {
      expect(defaultEmlFilename('Subject...')).toEqual('Subject.eml');
    });

    it('removes trailing spaces', () => {
      expect(defaultEmlFilename('Subject   ')).toEqual('Subject.eml');
    });

    it('removes trailing mix of dots and spaces', () => {
      expect(defaultEmlFilename('Subject . . ')).toEqual('Subject.eml');
    });

    it('does not remove a leading dot', () => {
      expect(defaultEmlFilename('.hidden')).toEqual('.hidden.eml');
    });

    it('does not remove dots in the middle of the name', () => {
      expect(defaultEmlFilename('v1.2.3 release')).toEqual('v1.2.3 release.eml');
    });
  });
});

describe('newestExportableMessagesForThreadIds', function () {
  const queryFor = (results: Message[]) => {
    const query: any = {
      order() {
        return this;
      },
      limit() {
        return this;
      },
      then(callback) {
        return Promise.resolve(results).then(callback);
      },
    };
    return query;
  };

  it('returns the single newest message the query yields for each thread', async () => {
    const a = new Message({ id: 'a', threadId: 't1' });
    const b = new Message({ id: 'b', threadId: 't2' });
    spyOn(DatabaseStore, 'findAll').andCallFake((klass, where) =>
      queryFor(where.threadId === 't1' ? [a] : [b])
    );

    const messages = await newestExportableMessagesForThreadIds(['t1', 't2']);
    expect(messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('excludes drafts, which have no raw source on the server', async () => {
    spyOn(DatabaseStore, 'findAll').andCallFake(() => queryFor([]));
    await newestExportableMessagesForThreadIds(['t1']);
    expect((DatabaseStore.findAll as any).calls[0].args[1]).toEqual({
      threadId: 't1',
      draft: false,
    });
  });

  it('omits threads that have no exportable message', async () => {
    const a = new Message({ id: 'a', threadId: 't1' });
    spyOn(DatabaseStore, 'findAll').andCallFake((klass, where) =>
      queryFor(where.threadId === 't1' ? [a] : [])
    );

    const messages = await newestExportableMessagesForThreadIds(['t1', 't2']);
    expect(messages.map((m) => m.id)).toEqual(['a']);
  });

  it('returns an empty array when given no threads', async () => {
    spyOn(DatabaseStore, 'findAll').andCallFake(() => queryFor([]));
    expect(await newestExportableMessagesForThreadIds([])).toEqual([]);
    expect(DatabaseStore.findAll).not.toHaveBeenCalled();
  });
});

describe('stageMessagesAsEml', function () {
  let queued: GetMessageRFC2822Task[] = [];
  let cleanup: string[] = [];

  // Stand in for the sync engine: when a fetch is awaited, write the file it
  // was asked to produce. `writeFor` decides which ones actually get written.
  const engineWrites = (writeFor: (task: GetMessageRFC2822Task) => boolean) => {
    (TaskQueue.waitForPerformRemote as any).andCallFake((task: GetMessageRFC2822Task) => {
      if (writeFor(task)) {
        fs.writeFileSync(task.filepath, 'Subject: raw\r\n\r\nbody\r\n');
        cleanup.push(path.dirname(task.filepath));
      }
      return Promise.resolve();
    });
  };

  beforeEach(() => {
    queued = [];
    cleanup = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(TaskQueue, 'waitForPerformRemote').andCallFake(() => Promise.resolve());
  });

  afterEach(() => {
    for (const dir of cleanup) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('queues one fetch per message, staging each into its own directory', async () => {
    engineWrites(() => true);
    const messages = [
      new Message({ id: 'm1', accountId: 'a1', subject: 'Hello' }),
      new Message({ id: 'm2', accountId: 'a2', subject: 'World' }),
    ];

    const staged = await stageMessagesAsEml(messages);

    expect(queued.length).toEqual(2);
    expect(queued.map((t) => t.messageId)).toEqual(['m1', 'm2']);
    expect(queued.map((t) => t.accountId)).toEqual(['a1', 'a2']);
    expect(staged.map((s) => path.basename(s.filePath))).toEqual(['Hello.eml', 'World.eml']);
    expect(path.dirname(staged[0].filePath)).not.toEqual(path.dirname(staged[1].filePath));
  });

  it('queues every fetch before awaiting any of them', async () => {
    let resolveAll;
    const gate = new Promise<void>((resolve) => (resolveAll = resolve));
    (TaskQueue.waitForPerformRemote as any).andCallFake(() => gate);

    const promise = stageMessagesAsEml([
      new Message({ id: 'm1', accountId: 'a1', subject: 'One' }),
      new Message({ id: 'm2', accountId: 'a1', subject: 'Two' }),
    ]);
    expect(queued.length).toEqual(2);
    resolveAll();
    const staged = await promise;
    // Nothing was written, so nothing is reported as staged
    expect(staged).toEqual([]);
  });

  it('omits messages whose file was never written', async () => {
    engineWrites((task) => task.messageId === 'm1');
    const staged = await stageMessagesAsEml([
      new Message({ id: 'm1', accountId: 'a1', subject: 'Written' }),
      new Message({ id: 'm2', accountId: 'a1', subject: 'Missing' }),
    ]);

    expect(staged.length).toEqual(1);
    expect(staged[0].message.id).toEqual('m1');
    expect(path.basename(staged[0].filePath)).toEqual('Written.eml');
  });

  it('uses an explicit filename when one is given', async () => {
    engineWrites(() => true);
    const staged = await stageMessagesAsEml(
      [new Message({ id: 'm1', accountId: 'a1', subject: 'Hello' })],
      { filename: 'Forwarded Message.eml' }
    );
    expect(path.basename(staged[0].filePath)).toEqual('Forwarded Message.eml');
  });

  it('does nothing when given no messages', async () => {
    expect(await stageMessagesAsEml([])).toEqual([]);
    expect(Actions.queueTask).not.toHaveBeenCalled();
  });
});
