/**
 * Pin the process timezone for the surrounding describe block.
 *
 * Node re-reads process.env.TZ on each Date operation, so this affects Date and moment
 * for the duration of the block. Restores by deleting the key when it was unset —
 * assigning undefined would leave the literal string "undefined", which resolves to no
 * zone at all and breaks every spec that runs afterwards.
 *
 * The pin only holds while a spec runs, so compute date fixtures inside `it`, never in the
 * describe body — those evaluate at collection time and would capture the ambient zone.
 * Call this once per describe: two calls in one block would pin the last and restore the first.
 *
 * Whether the reassignment reaches the Electron renderer's zone on every platform is
 * unverified — it works in Node on macOS. The canary below exists so a pin that doesn't
 * take fails loudly here, rather than letting DST assertions pass vacuously.
 */
export function pinTimezone(tz: string): void {
  let original: string | undefined;

  beforeEach(function () {
    original = process.env.TZ;
    process.env.TZ = tz;

    // Fail loudly if the zone didn't take, rather than passing DST assertions vacuously
    const mar8 = new Date(2026, 2, 8).getTime();
    const mar9 = new Date(2026, 2, 9).getTime();
    expect((mar9 - mar8) / 1000).toBe(82800);
  });

  afterEach(function () {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  });
}
