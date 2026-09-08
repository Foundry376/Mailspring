import { MailsyncProcess } from '../src/mailsync-process';

describe('MailsyncProcess._buildCrashError', () => {
  let proc: MailsyncProcess;

  beforeEach(() => {
    proc = new MailsyncProcess({ configDirPath: '/tmp', resourcePath: '/tmp', verbose: false });
  });

  it('flags a crash with the offline marker during test mode as a network error', () => {
    const rawLog = 'Testing connection\n{"offline":true,"retryable":true}\n';
    const error: any = proc._buildCrashError('test', 1, null, rawLog);
    expect(error.isNetworkError).toBe(true);
    expect(error.message).not.toContain('unknown error');
  });

  it('flags a crash mid OAuth2 token fetch (SEH 0xE06D7363) during test mode as a network error', () => {
    const rawLog =
      'Waiting for Account JSON:\n\nWaiting for Identity JSON:\ninfo: Identity created at 123 - using ID Schema 1\ninfo: Fetching XOAuth2 access token (gmail) for abc123\n';
    const error: any = proc._buildCrashError('test', 0xe06d7363, null, rawLog);
    expect(error.isNetworkError).toBe(true);
    expect(error.message).not.toContain('unknown error');
  });

  it('does not flag the same OAuth2 crash outside of test mode', () => {
    const rawLog = 'info: Fetching XOAuth2 access token (gmail) for abc123\n';
    const error: any = proc._buildCrashError('sync', 0xe06d7363, null, rawLog);
    expect(error.isNetworkError).toBe(false);
  });

  it('does not flag an unrelated crash with the same exit code as a network error', () => {
    const rawLog = 'Some other crash entirely, nothing about OAuth2\n';
    const error: any = proc._buildCrashError('test', 0xe06d7363, null, rawLog);
    expect(error.isNetworkError).toBe(false);
    expect(error.message).toContain('unknown error');
  });

  it('reports a signal-terminated crash with the exit description in the message', () => {
    const error: any = proc._buildCrashError('sync', null, 'SIGKILL' as NodeJS.Signals, 'crashed');
    expect(error.isNetworkError).toBe(false);
    expect(error.message).toContain('signal SIGKILL');
  });
});
