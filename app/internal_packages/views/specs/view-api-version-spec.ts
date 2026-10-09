import {
  CURRENT_API_VERSION,
  INITIAL_API_VERSION,
  apiVersionOf,
  compatibility,
  rebuildRequest,
  shimsFor,
  withApiVersion,
} from '../lib/api-version';

describe('View API versions', function () {
  it('treats a missing or malformed apiVersion as the initial release', () => {
    expect(apiVersionOf({})).toBe(INITIAL_API_VERSION);
    expect(apiVersionOf({ apiVersion: 'latest' })).toBe(INITIAL_API_VERSION);
    expect(apiVersionOf(null)).toBe(INITIAL_API_VERSION);
    expect(apiVersionOf({ apiVersion: '2026-10-05' })).toBe('2026-10-05');
  });

  it('runs versions in the supported range and flags the rest', () => {
    const range = { min: '2026-10-01', current: '2026-10-05' };
    expect(compatibility('2026-10-01', range)).toBe('ok');
    expect(compatibility('2026-10-05', range)).toBe('ok');
    expect(compatibility('2026-09-30', range)).toBe('too-old');
    expect(compatibility('2027-01-01', range)).toBe('too-new');
  });

  it('applies a shim to Views older than the change that introduced it', () => {
    const shims = [{ id: 'old-threads-shape', since: '2026-11-01', description: '' }];
    expect(shimsFor('2026-10-05', shims)).toEqual(['old-threads-shape']);
    expect(shimsFor('2026-11-01', shims)).toEqual([]);
  });

  it('stamps drafts without a version and leaves declared ones alone', () => {
    expect(withApiVersion({ name: 'x' } as any).apiVersion).toBe(CURRENT_API_VERSION);
    expect(withApiVersion({ name: 'x', apiVersion: '2026-10-01' } as any).apiVersion).toBe(
      '2026-10-01'
    );
  });

  it('asks the agent to move a View to the current API', () => {
    const text = rebuildRequest('2026-09-01');
    expect(text).toContain('2026-09-01');
    expect(text).toContain(`"apiVersion": "${CURRENT_API_VERSION}"`);
  });
});
