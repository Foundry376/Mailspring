/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from 'path';
import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

const formatStackTrace = function(spec, message, stackTrace, indent) {
  if (message == null) {
    message = '';
  }
  if (indent == null) {
    indent = '';
  }
  if (!stackTrace) {
    return stackTrace;
  }

  const jasminePattern = /^\s*at\s+.*\(?.*[/\\]jasmine(-[^/\\]*)?\.js:\d+:\d+\)?\s*$/;
  const firstJasmineLinePattern = /^\s*at [/\\].*[/\\]jasmine(-[^/\\]*)?\.js:\d+:\d+\)?\s*$/;
  const convertedLines = [];
  for (var line of stackTrace.split('\n')) {
    if (!jasminePattern.test(line)) {
      convertedLines.push(line);
    }
    if (firstJasmineLinePattern.test(line)) {
      break;
    }
  }

  stackTrace = convertedLines.join('\n');
  let lines = stackTrace.split('\n');

  // Remove first line of stack when it is the same as the error message
  const errorMatch = lines[0] != null ? lines[0].match(/^Error: (.*)/) : undefined;
  if (errorMatch && message.trim() === errorMatch[1].trim()) {
    lines.shift();
  }

  for (let index = 0; index < lines.length; index++) {
    // Remove prefix of lines matching: at [object Object].<anonymous> (path:1:2)
    line = lines[index];
    const prefixMatch = line.match(/at \[object Object\]\.<anonymous> \(([^)]+)\)/);
    if (prefixMatch) {
      line = `at ${prefixMatch[1]}`;
    }

    // Relativize locations to spec directory
    lines[index] = line.replace(`at ${spec.specDirectory}${path.sep}`, 'at ');
  }

  lines = lines.map(line => indent + line.trim());
  return lines.join('\n');
};

function indentationString(suite, plus) {
  if (plus == null) {
    plus = 0;
  }
  let rootSuite = suite;
  let indentLevel = 0 + plus;
  while (rootSuite.parentSuite) {
    rootSuite = rootSuite.parentSuite;
    indentLevel += 1;
  }
  return __range__(0, indentLevel, false)
    .map(() => '  ')
    .join('');
}

function suiteString(spec) {
  const descriptions = [spec.suite.description];

  let rootSuite = spec.suite;
  while (rootSuite.parentSuite) {
    const indent = indentationString(rootSuite);
    descriptions.unshift(indent + rootSuite.description);
    rootSuite = rootSuite.parentSuite;
  }

  return descriptions.join('\n');
}

class N1GuiReporter extends React.Component {
  render() {
    return (
      <div className="spec-reporter">
        <button className="btn reload-button" onClick={this.onReloadSpecs}>
          Reload Specs
        </button>
        <div className="symbol-area">
          <div className="symbol-header">Core</div>
          <div className="symbol-summary list-unstyled">{this._renderSpecsOfType('core')}</div>
        </div>
        <div className="symbol-area">
          <div className="symbol-header">Bundled</div>
          <div className="symbol-summary list-unstyled">{this._renderSpecsOfType('bundled')}</div>
        </div>
        <div className="symbol-area">
          <div className="symbol-header">User</div>
          <div className="symbol-summary list-unstyled">{this._renderSpecsOfType('user')}</div>
        </div>
        {this._renderStatus()}
        <div className="results">{this._renderFailures()}</div>
        <div className="plain-text-output">{this.props.plainTextOutput}</div>
      </div>
    );
  }

  _renderSpecsOfType = type => {
    const items = [];
    this.props.specs.forEach((spec, idx) => {
      if (spec.specType !== type) {
        return;
      }
      let statusClass = 'pending';
      let title = undefined;
      const results = spec.results();
      if (results) {
        if (results.skipped) {
          statusClass = 'skipped';
        } else if (results.failedCount > 0) {
          statusClass = 'failed';
          title = spec.getFullName();
        } else if (spec.endedAt) {
          statusClass = 'passed';
        }
      }

      return items.push(<li key={idx} title={title} className={`spec-summary ${statusClass}`} />);
    });

    return items;
  };

  _renderFailures = () => {
    // We have an array of specs with `suite` and potentially N `parentSuite` from there.
    // Create a tree instead.
    const topLevelSuites = [];

    const failedSpecs = this.props.specs.filter(
      spec => spec.endedAt && spec.results().failedCount > 0
    );

    for (let spec of failedSpecs) {
      let { suite } = spec;
      while (suite.parentSuite) {
        suite = suite.parentSuite;
      }
      if (topLevelSuites.indexOf(suite) === -1) {
        topLevelSuites.push(suite);
      }
    }

    return topLevelSuites.map((suite, idx) => (
      <SuiteResultView suite={suite} key={idx} allSpecs={failedSpecs} />
    ));
  };

  _renderStatus = () => {
    let message, specCount;
    let failedCount = 0;
    let skippedCount = 0;
    let completeCount = 0;
    for (let spec of this.props.specs) {
      const results = spec.results();
      if (!spec.endedAt) {
        continue;
      }
      if (results.failedCount > 0) {
        failedCount += 1;
      }
      if (results.skipped) {
        skippedCount += 1;
      }
      if (results.passedCount > 0 && results.failedCount === 0) {
        completeCount += 1;
      }
    }

    if (failedCount === 1) {
      message = `${failedCount} failure`;
    } else {
      message = `${failedCount} failures`;
    }

    if (skippedCount) {
      specCount = `${completeCount - skippedCount}/${this.props.specs.length -
        skippedCount} (${skippedCount} skipped)`;
    } else {
      specCount = `${completeCount}/${this.props.specs.length}`;
    }

    return (
      <div className="status alert alert-info">
        <div className="time" />
        <div className="spec-count">{specCount}</div>
        <div className="message">{message}</div>
      </div>
    );
  };

  onReloadSpecs = () => {
    require('electron')
      .remote.getCurrentWindow()
      .reload();
  };
}

class SuiteResultView extends React.Component {
  static propTypes = {
    suite: PropTypes.object,
    allSpecs: PropTypes.array,
  };

  render() {
    let items = [];
    let subsuites = [];

    this.props.allSpecs.forEach(spec => {
      if (spec.suite === this.props.suite) {
        return items.push(spec);
      } else {
        let { suite } = spec;
        while (suite.parentSuite) {
          if (suite.parentSuite === this.props.suite) {
            subsuites.push(suite);
            return;
          }
          suite = suite.parentSuite;
        }
      }
    });

    items = items.map((spec, idx) => <SpecResultView key={idx} spec={spec} />);

    subsuites = subsuites.map((suite, idx) => (
      <SuiteResultView key={idx} suite={suite} allSpecs={this.props.allSpecs} />
    ));

    return (
      <div className="suite">
        <div className="description">{this.props.suite.description}</div>
        <div className="results">
          {items}
          {subsuites}
        </div>
      </div>
    );
  }
}

class SpecResultView extends React.Component {
  static propTypes = {
    spec: PropTypes.object,
  };

  render() {
    let { description } = this.props.spec;
    const resultItems = this.props.spec.results().getItems();
    if (description.indexOf('it ') !== 0) {
      description = `it ${description}`;
    }

    const failures = [];
    for (let idx = 0; idx < resultItems.length; idx++) {
      const result = resultItems[idx];
      if (result.passed()) {
        continue;
      }
      const stackTrace = formatStackTrace(this.props.spec, result.message, result.trace.stack);
      failures.push(
        <div key={idx}>
          <div className="result-message fail">{result.message}</div>
          <div className="stack-trace padded">{stackTrace}</div>
        </div>
      );
    }

    return (
      <div className="spec">
        <div className="description">{description}</div>
        <div className="spec-failures">{failures}</div>
      </div>
    );
  }
}

const el = document.createElement('div');
document.body.appendChild(el);

let startedAt = null;
let specs = [];
let plainTextOutput = '';

const update = () => {
  const component = <N1GuiReporter startedAt={startedAt} specs={specs} />;
  return ReactDOM.render(component, el);
};

export function reportRunnerStarting(runner) {
  specs = runner.specs();
  startedAt = Date.now();
  update();
}

export function reportRunnerResults(runner) {
  update();
}

export function reportSuiteResults(suite) {}

export function reportSpecResults(spec) {
  spec.endedAt = Date.now();
  update();
}

export function reportPlainTextSpecResult(spec) {
  let str = '';
  if (spec.results().failedCount > 0) {
    str += suiteString(spec) + '\n';
    const indent = indentationString(spec.suite, 1);
    const stackIndent = indentationString(spec.suite, 2);

    let { description } = spec;
    if (description.indexOf('it ') !== 0) {
      description = `it ${description}`;
    }
    str += indent + description + '\n';

    for (let result of spec.results().getItems()) {
      if (result.passed()) {
        continue;
      }
      str += indent + result.message + '\n';
      const stackTrace = formatStackTrace(spec, result.message, result.trace.stack, stackIndent);
      str += stackTrace + '\n';
    }
    str += '\n\n';
  }

  plainTextOutput = plainTextOutput + str;
  update();
}

export function reportSpecStarting(spec) {
  update();
}

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
