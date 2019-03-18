import Task from './task';

export default class AnalyzeDBTask extends Task {
  static attributes = Object.assign({}, Task.attributes);

  label() {
    return `Analyzing and optimizing database`;
  }
}
