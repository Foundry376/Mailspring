import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  mboxFromLine,
  senderFromEml,
  transformEmlToMbox,
  appendStagedMessages,
  readMboxExportManifest,
} from '../../src/services/mbox-utils';

describe('mbox-utils', function () {
  describe('mboxFromLine', () => {
    it('formats an asctime-style UTC timestamp', () => {
      const date = new Date(Date.UTC(2026, 0, 15, 9, 5, 3));
      expect(mboxFromLine('user@example.com', date)).toEqual(
        'From user@example.com Thu Jan 15 09:05:03 2026\n'
      );
    });

    it('space-pads single-digit days of the month', () => {
      const date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      expect(mboxFromLine('user@example.com', date)).toEqual(
        'From user@example.com Thu Jan  1 00:00:00 2026\n'
      );
    });
  });

  describe('senderFromEml', () => {
    it('prefers Return-Path over From', () => {
      const raw =
        'Return-Path: <bounce@example.com>\r\nFrom: Alice <alice@example.com>\r\n\r\nBody';
      expect(senderFromEml(raw)).toEqual('bounce@example.com');
    });

    it('extracts a bracketed address from the From header', () => {
      const raw = 'From: "Alice A." <alice@example.com>\r\nSubject: Hi\r\n\r\nBody';
      expect(senderFromEml(raw)).toEqual('alice@example.com');
    });

    it('extracts a bare address from the From header', () => {
      const raw = 'From: alice@example.com\r\nSubject: Hi\r\n\r\nBody';
      expect(senderFromEml(raw)).toEqual('alice@example.com');
    });

    it('handles folded headers', () => {
      const raw =
        'From: A very long display name\r\n <alice@example.com>\r\nSubject: Hi\r\n\r\nBody';
      expect(senderFromEml(raw)).toEqual('alice@example.com');
    });

    it('does not read addresses from the message body', () => {
      const raw = 'Subject: Hi\r\n\r\nContact me at someone@example.com';
      expect(senderFromEml(raw)).toEqual('MAILER-DAEMON');
    });

    it('falls back to MAILER-DAEMON when no address is present', () => {
      const raw = 'Subject: Hi\r\n\r\nBody';
      expect(senderFromEml(raw)).toEqual('MAILER-DAEMON');
    });
  });

  describe('transformEmlToMbox', () => {
    it('converts CRLF line endings to LF', () => {
      expect(transformEmlToMbox('Subject: Hi\r\n\r\nBody\r\n')).toEqual('Subject: Hi\n\nBody\n');
    });

    it('quotes body lines beginning with "From "', () => {
      const raw = 'Subject: Hi\r\n\r\nFrom the desk of Alice\r\n';
      expect(transformEmlToMbox(raw)).toEqual('Subject: Hi\n\n>From the desk of Alice\n');
    });

    it('quotes already-quoted From lines again (mboxrd)', () => {
      const raw = 'Subject: Hi\r\n\r\n>From before\r\n>>From way before\r\n';
      expect(transformEmlToMbox(raw)).toEqual('Subject: Hi\n\n>>From before\n>>>From way before\n');
    });

    it('does not quote lines merely containing "From "', () => {
      const raw = 'Subject: Hi\r\n\r\nA note From Alice\r\nFromage is cheese\r\n';
      expect(transformEmlToMbox(raw)).toEqual(
        'Subject: Hi\n\nA note From Alice\nFromage is cheese\n'
      );
    });

    it('ensures the message ends with a newline', () => {
      expect(transformEmlToMbox('Subject: Hi\r\n\r\nBody')).toEqual('Subject: Hi\n\nBody\n');
    });
  });

  describe('appendStagedMessages', () => {
    let dir: string;
    let staging: string;
    let mbox: string;

    const stageFile = (index: number, subject: string, body: string, date: Date) => {
      const name = `${String(index).padStart(5, '0')} - ${subject} - 2026-01-01.eml`;
      const filepath = path.join(staging, name);
      fs.writeFileSync(
        filepath,
        Buffer.from(`From: a <a@example.com>\r\nSubject: ${subject}\r\n\r\n${body}\r\n`, 'latin1')
      );
      fs.utimesSync(filepath, new Date(), date);
      return name;
    };

    const expectedMessage = (subject: string, body: string, date: Date) =>
      mboxFromLine('a@example.com', date) +
      transformEmlToMbox(`From: a <a@example.com>\r\nSubject: ${subject}\r\n\r\n${body}\r\n`) +
      '\n';

    const date = new Date(Date.UTC(2026, 2, 10, 12, 0, 0));

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbox-utils-spec-'));
      staging = path.join(dir, 'staging');
      mbox = path.join(dir, 'out.mbox');
      fs.mkdirSync(staging);
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('appends only files covered by exportedCount and deletes them', async () => {
      stageFile(0, 'zero', 'body0', date);
      stageFile(1, 'one', 'body1', date);
      stageFile(2, 'inflight', 'body2', date);

      const remaining = await appendStagedMessages(staging, mbox, 2);

      expect(remaining).toEqual(1);
      expect(readMboxExportManifest(staging).consumedCount).toEqual(2);
      expect(fs.readdirSync(staging).filter((f) => f.endsWith('.eml')).length).toEqual(1);
      expect(fs.readFileSync(mbox).toString('latin1')).toEqual(
        expectedMessage('zero', 'body0', date) + expectedMessage('one', 'body1', date)
      );
    });

    it('consumes everything when exportedCount is null', async () => {
      stageFile(0, 'zero', 'body0', date);
      stageFile(1, 'one', 'body1', date);

      const remaining = await appendStagedMessages(staging, mbox, null);

      expect(remaining).toEqual(0);
      expect(fs.readdirSync(staging).filter((f) => f.endsWith('.eml')).length).toEqual(0);
    });

    it('truncates a torn tail left by a crash before the manifest write', async () => {
      stageFile(0, 'zero', 'body0', date);
      await appendStagedMessages(staging, mbox, 1);

      // a batch was appended but the crash happened before the manifest
      // recorded it — the source file is still staged
      fs.appendFileSync(mbox, 'TORN PARTIAL MESSAGE');
      stageFile(1, 'one', 'body1', date);
      await appendStagedMessages(staging, mbox, 2);

      expect(fs.readFileSync(mbox).toString('latin1')).toEqual(
        expectedMessage('zero', 'body0', date) + expectedMessage('one', 'body1', date)
      );
    });

    it('deletes consumed leftovers instead of re-appending them', async () => {
      const name = stageFile(0, 'zero', 'body0', date);
      await appendStagedMessages(staging, mbox, 1);

      // the manifest recorded the append but the crash happened before the
      // consumed file was deleted
      stageFile(0, 'zero', 'body0', date);
      stageFile(1, 'one', 'body1', date);
      await appendStagedMessages(staging, mbox, 2);

      expect(fs.existsSync(path.join(staging, name))).toBe(false);
      expect(fs.readFileSync(mbox).toString('latin1')).toEqual(
        expectedMessage('zero', 'body0', date) + expectedMessage('one', 'body1', date)
      );
    });

    it('throws if the mbox is shorter than the manifest offset', async () => {
      stageFile(0, 'zero', 'body0', date);
      await appendStagedMessages(staging, mbox, 1);
      fs.truncateSync(mbox, 3);
      stageFile(1, 'one', 'body1', date);

      let threw = null;
      try {
        await appendStagedMessages(staging, mbox, 2);
      } catch (err) {
        threw = err;
      }
      expect(threw).not.toBe(null);
    });

    it('consumes large accumulations across multiple crash-safe sub-batches', async () => {
      const count = 120; // spans three 50-file sub-batches
      let expected = '';
      for (let i = 0; i < count; i++) {
        stageFile(i, `m${i}`, `body${i}`, date);
        expected += expectedMessage(`m${i}`, `body${i}`, date);
      }

      const remaining = await appendStagedMessages(staging, mbox, null);

      expect(remaining).toEqual(0);
      expect(readMboxExportManifest(staging).consumedCount).toEqual(count);
      expect(fs.readdirSync(staging).filter((f) => f.endsWith('.eml')).length).toEqual(0);
      expect(fs.readFileSync(mbox).toString('latin1')).toEqual(expected);
    });

    it('creates an empty mbox for an export with no messages', async () => {
      const remaining = await appendStagedMessages(staging, mbox, null);

      expect(remaining).toEqual(0);
      expect(fs.existsSync(mbox)).toBe(true);
      expect(fs.statSync(mbox).size).toEqual(0);
    });

    it('overwrites a pre-existing file at the destination', async () => {
      fs.writeFileSync(mbox, 'OLD CONTENTS THE USER AGREED TO OVERWRITE');
      stageFile(0, 'zero', 'body0', date);

      await appendStagedMessages(staging, mbox, null);

      expect(fs.readFileSync(mbox).toString('latin1')).toEqual(
        expectedMessage('zero', 'body0', date)
      );
    });
  });
});
