import { lastJSONResponse } from '../src/mailsync-process';

describe('lastJSONResponse', function () {
  it('reads a result that has no trailing newline', function () {
    expect(lastJSONResponse('{"error":null}')).toEqual({ error: null });
  });

  it('skips the progress lines mailsync prints before the result', function () {
    expect(lastJSONResponse('Running Setup\n{"error":null}')).toEqual({ error: null });
  });

  it('tolerates a trailing newline and blank lines', function () {
    expect(lastJSONResponse('{"error":null}\n\n')).toEqual({ error: null });
  });

  it('returns the last result when several objects were written', function () {
    expect(lastJSONResponse('{"error":"first"}\n{"error":"second"}\n')).toEqual({
      error: 'second',
    });
  });

  it('returns null when nothing on stdout is JSON', function () {
    expect(lastJSONResponse('Error: Could not load libtidy.\nInstall libtidy.\n')).toBe(null);
  });

  it('reads a result written with Windows line endings', function () {
    // mailsync's stdout is in text mode on Windows, so every newline arrives as CRLF and
    // the result line carries a trailing carriage return.
    expect(lastJSONResponse('Running Setup\r\n{"error":null}\r\n')).toEqual({ error: null });
  });

  it('returns null for empty output', function () {
    expect(lastJSONResponse('')).toBe(null);
  });

  it('ignores a truncated object at the end of the stream', function () {
    expect(lastJSONResponse('{"error":null}\n{"error":')).toEqual({ error: null });
  });
});

describe('accumulating mailsync stdout', function () {
  // mailsync's result line carries the whole IMAP/SMTP conversation in `test` mode, so it
  // routinely spans more than one 64KB chunk, and a server error or account name is often
  // non-ASCII. Decoding each chunk on its own splits any multi-byte character that lands on
  // a boundary into two replacement characters.
  const payload = '{"error":"Café serveur"}';
  const bytes = Buffer.from(payload, 'utf-8');
  const splitAt = bytes.indexOf(0xc3) + 1; // between the two bytes of 'é'
  const chunks = [bytes.subarray(0, splitAt), bytes.subarray(splitAt)];

  it('mangles a character split across chunks when each chunk is decoded alone', function () {
    const perChunk = chunks.map(c => c.toString('utf-8')).join('');
    expect(perChunk).not.toEqual(payload);
    expect(perChunk).toContain('�');
    expect(lastJSONResponse(perChunk).error).not.toEqual('Café serveur');
  });

  it('preserves it when the bytes are joined before decoding', function () {
    const joined = Buffer.concat(chunks).toString('utf-8');
    expect(joined).toEqual(payload);
    expect(lastJSONResponse(joined)).toEqual({ error: 'Café serveur' });
  });
});
