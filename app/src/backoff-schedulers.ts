const BASE_TIMEOUT = 2 * 1000;
const MAX_TIMEOUT = 5 * 60 * 1000;

function exponentialBackoff(base, numTries) {
  return base * 2 ** numTries;
}

interface BackoffSchedulerOptions {
  baseDelay?: number;
  maxDelay?: number;
  getNextBackoffDelay: (baseDelay: number, numTries: number) => number;
  jitter?: boolean;
}
export class BackoffScheduler {
  _numTries = 0;
  _currentDelay = 0;
  _jitter: boolean;
  _maxDelay: number;
  _baseDelay: number;
  _getNextBackoffDelay: (baseDelay: number, numTries: number) => number;

  constructor(opts: BackoffSchedulerOptions) {
    this._jitter = opts.jitter !== undefined ? opts.jitter : true;
    this._maxDelay = opts.maxDelay || MAX_TIMEOUT;
    this._baseDelay = opts.baseDelay || BASE_TIMEOUT;
    if (!opts.getNextBackoffDelay) {
      throw new Error('BackoffScheduler: Must pass `getNextBackoffDelay` function');
    }
    this._getNextBackoffDelay = opts.getNextBackoffDelay;
  }

  numTries() {
    return this._numTries;
  }

  currentDelay() {
    return this._currentDelay;
  }

  reset() {
    this._numTries = 0;
    this._currentDelay = 0;
  }

  nextDelay() {
    const nextDelay = this._calcNextDelay();
    this._numTries++;
    this._currentDelay = nextDelay;
    return nextDelay;
  }

  _calcNextDelay() {
    let nextDelay = this._getNextBackoffDelay(this._baseDelay, this._numTries);
    if (this._jitter) {
      // Why jitter? See:
      // https://www.awsarchitectureblog.com/2015/03/backoff.html
      nextDelay *= Math.random();
    }
    return Math.min(nextDelay, this._maxDelay);
  }
}

export class ExponentialBackoffScheduler extends BackoffScheduler {
  constructor(opts = {}) {
    super({ ...opts, getNextBackoffDelay: exponentialBackoff });
  }
}
