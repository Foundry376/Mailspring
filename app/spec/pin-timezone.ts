/**
 * Pin the process timezone for the surrounding describe block.
 *
 * Node re-reads process.env.TZ on each Date operation, so this affects Date and moment
 * for the duration of the block. Restores by deleting the key when it was unset —
 * assigning undefined would leave the literal string "undefined", which resolves to no
 * zone at all and breaks every spec that runs afterwards.
 */
export function pinTimezone(tz: string): void {
  let original: string | undefined;

  beforeEach(function () {
    original = process.env.TZ;
    process.env.TZ = tz;
  });

  afterEach(function () {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  });
}
