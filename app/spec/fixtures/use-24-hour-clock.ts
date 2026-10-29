/** Answers "Use 24-hour clock" (core.workspace.use24HourClock) for the rest of the spec. */
export function use24HourClock(on: boolean) {
  const get = AppEnv.config.get.bind(AppEnv.config);
  spyOn(AppEnv.config, 'get').andCallFake((key: string) =>
    key === 'core.workspace.use24HourClock' ? on : get(key)
  );
}
