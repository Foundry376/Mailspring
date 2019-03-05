import { jasmine } from './jasmine';

export default class TerminalReporter extends jasmine.Reporter {
  reportRunnerResults(runner) {
    if (runner.results().failedCount > 0) {
      return AppEnv.exit(1);
    }
    return AppEnv.exit(0);
  }
}
