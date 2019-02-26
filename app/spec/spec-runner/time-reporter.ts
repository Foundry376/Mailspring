/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const _ = require('underscore');
const _str = require('underscore.string');
const { jasmine } = require('./jasmine');

module.exports = class TimeReporter extends jasmine.Reporter {
  constructor() {
    super();

    window.timedSpecs = [];
    window.timedSuites = {};

    window.logLongestSpec = () => this.logLongestSpecs(1);
    window.logLongestSpecs = number => this.logLongestSpecs(number);
    window.logLongestSuite = () => this.logLongestSuites(1);
    window.logLongestSuites = number => this.logLongestSuites(number);
  }

  logLongestSuites(number, log) {
    if (number == null) {
      number = 10;
    }
    if (!(window.timedSuites.length > 0)) {
      return;
    }

    if (log == null) {
      log = line => console.log(line);
    }
    log('Longest running suites:');
    const suites = _.map(window.timedSuites, (key, value) => [value, key]);
    for (let suite of Array.from(_.sortBy(suites, suite => -suite[1]).slice(0, number))) {
      const time = Math.round(suite[1] / 100) / 10;
      log(`  ${suite[0]} (${time}s)`);
    }
  }

  logLongestSpecs(number, log) {
    if (number == null) {
      number = 10;
    }
    if (!(window.timedSpecs.length > 0)) {
      return;
    }

    if (log == null) {
      log = line => console.log(line);
    }
    log('Longest running specs:');
    for (let spec of Array.from(_.sortBy(window.timedSpecs, spec => -spec.time).slice(0, number))) {
      const time = Math.round(spec.time / 100) / 10;
      log(`${spec.description} (${time}s)`);
    }
  }

  reportSpecStarting(spec) {
    const stack = [spec.description];
    let { suite } = spec;
    while (suite) {
      stack.unshift(suite.description);
      this.suite = suite.description;
      suite = suite.parentSuite;
    }

    const reducer = function(memo, description, index) {
      if (index === 0) {
        return `${description}`;
      } else {
        return `${memo}\n${_str.repeat('  ', index)}${description}`;
      }
    };
    this.description = _.reduce(stack, reducer, '');
    this.time = Date.now();
  }

  reportSpecResults(spec) {
    if (this.time == null || this.description == null) {
      return;
    }

    const duration = Date.now() - this.time;

    if (duration > 0) {
      window.timedSpecs.push({
        description: this.description,
        time: duration,
        fullName: spec.getFullName(),
      });

      if (window.timedSuites[this.suite]) {
        window.timedSuites[this.suite] += duration;
      } else {
        window.timedSuites[this.suite] = duration;
      }
    }

    this.time = null;
    this.description = null;
  }
};
