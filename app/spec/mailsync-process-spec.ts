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
