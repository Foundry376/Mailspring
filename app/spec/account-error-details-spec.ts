import { describeSyncError } from '../internal_packages/preferences/lib/tabs/preferences-account-details';

describe('describeSyncError', function () {
  it('reports when no error was recorded', function () {
    expect(describeSyncError(null)).toBe('Sync Error: none recorded');
  });

  it('includes the message of an error the engine exited with', function () {
    // mailsync prints this to stdout and exits before spdlog exists, so it is
    // never written to mailsync-<id>.log.
    const error = new Error('Setup Failed: Failed opening file mailsync-a1.log for writing');
    expect(describeSyncError({ code: 1, error, signal: null })).toBe(
      'Sync Error (exit code 1): Setup Failed: Failed opening file mailsync-a1.log for writing'
    );
  });

  it('names the signal when the engine was killed rather than exiting', function () {
    const error = new Error('*** A C++ exception occurred during program execution:');
    expect(describeSyncError({ code: null, error, signal: 'SIGABRT' })).toBe(
      'Sync Error (signal SIGABRT): *** A C++ exception occurred during program execution:'
    );
  });

  it('reads an error that has been through config.json and is no longer an Error', function () {
    expect(
      describeSyncError({ code: 1, error: { message: 'ErrorConnection' } as any, signal: null })
    ).toBe('Sync Error (exit code 1): {"message":"ErrorConnection"}');
  });

  it('still reports the exit code when the engine said nothing', function () {
    expect(describeSyncError({ code: -1, error: undefined, signal: null })).toBe(
      'Sync Error (exit code -1): no message provided'
    );
  });
});
