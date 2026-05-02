const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function getSuitePath(spec): string[] {
  const path: string[] = [];
  let suite = spec.suite;
  while (suite) {
    if (suite.description) path.unshift(suite.description);
    suite = suite.parentSuite;
  }
  return path;
}

export default class ConsoleReporter {
  private lastSuitePath: string[] = [];
  private failures: Array<{ name: string; items: any[] }> = [];
  private passCount = 0;

  reportSpecStarting(spec) {
    const suitePath = getSuitePath(spec);

    // Find where the current path diverges from the last
    let firstDiff = 0;
    while (
      firstDiff < suitePath.length &&
      firstDiff < this.lastSuitePath.length &&
      suitePath[firstDiff] === this.lastSuitePath[firstDiff]
    ) {
      firstDiff++;
    }

    // Print new/changed suite headers, with a blank line before top-level ones
    for (let i = firstDiff; i < suitePath.length; i++) {
      if (i === 0) process.stdout.write('\n');
      const indent = '  '.repeat(i + 1);
      process.stdout.write(`${indent}${suitePath[i]}\n`);
    }
    this.lastSuitePath = suitePath;

    // Prefix all console output with the spec name for debugging context
    const withContext = (log: (...args: any[]) => void) => {
      return (...args: any[]) => {
        return log(`[${spec.getFullName()}] ${args[0]}`, ...args.slice(1));
      };
    };
    console.log = withContext(originalLog);
    console.warn = withContext(originalWarn);
    console.error = withContext(originalError);
  }

  reportSpecResults(spec) {
    if (console.log !== originalLog) console.log = originalLog;
    if (console.warn !== originalWarn) console.warn = originalWarn;
    if (console.error !== originalError) console.error = originalError;

    const suitePath = getSuitePath(spec);
    const indent = '  '.repeat(suitePath.length + 1);

    if (spec.results().passed()) {
      this.passCount++;
      process.stdout.write(`${indent}\u2713 ${spec.description}\n`);
    } else {
      const failItems = spec
        .results()
        .getItems()
        .filter((item: any) => !item.passed_);
      this.failures.push({ name: spec.getFullName(), items: failItems });
      process.stdout.write(`${indent}\u2717 ${spec.description}\n`);
    }
  }

  reportRunnerResults(_runner) {
    process.stdout.write('\n\n');
    process.stdout.write(`  ${this.passCount} passing\n`);

    if (this.failures.length > 0) {
      process.stdout.write(`  ${this.failures.length} failing\n`);
      process.stdout.write('\n');
      this.failures.forEach((failure, i) => {
        process.stdout.write(`  ${i + 1}) ${failure.name}\n`);
        failure.items.forEach((item: any) => {
          process.stdout.write(`     ${item.message}\n`);
          if (item.trace && item.trace.stack) {
            item.trace.stack
              .split('\n')
              .slice(1, 6)
              .forEach((line) => process.stdout.write(`     ${line.trim()}\n`));
          }
          process.stdout.write('\n');
        });
      });
    }
  }
}
