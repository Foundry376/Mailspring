/*
  To add a tutorial segment, you need to register it with the `tutorial` service
  and update SEGMENT_ORDERS appropriately. The registration takes a name for the
  segment and an array of steps. Each step should be an object with two items:
    windowType: a string that indicates which window this step should be run in,
      e.g. 'default' or 'composer'
    perform: a function that actually runs the step. When the TutorialStore calls
      this function, it will pass in two parameters: render() and clear(). These
      are equivalent to the _render() and _clearRender() methods in this file.
      This perform function should return an instance of AbortablePromise (see the
      tutorial-utils file). Using AbortablePromises allows the TutorialStore to
      proceed only once the step has actually finished, or to abort the step if
      the user skips the segment.

  Note that each "step" is not necessarily connected to a single render() call or
  what the user might perceive as a step. The separation of steps is more to allow
  a segment to operate in multiple windows. So, there can be multiple user-perceived
  steps within a single "step" of the segment. In fact, combining steps is useful
  for ensuring transactional consistency. For instance, consider the following steps:
    1) User should do X in the composer
    2) User should send the email with the modifications from X.
  As separate steps, it's possible for the user to do step 1, close the composer,
  and then start step 2 the next time they open a composer window, but then the
  modifications from X won't necessarily be there! If these two were combined
  into a single step, the user would have to restart at X the next time they opened
  a composer window.

  Ordering calls to render() and AbortablePromises within steps:
    Most of the existing steps tend to create an AbortablePromise, call render(),
    and then return the AbortablePromise. This seems strange, because the step didn't
    do anything with the AbortablePromise before returning it, and could have just
    created it on the return line. However, it is better to create the AbortablePromise
    first, because the render() call can potentially be slow. If the user naturally
    performs the action before the prompt shows up, we still want to be able to
    intercept it and move on to the next prompt.
*/


import NylasStore from 'nylas-store';

// Helper functions for accessing the tutorial-specific parts of the config
const TutorialConfig = {
  getConfigKey: (name) => `core.tutorial.${name}`,
  getState: (name) => {
    return NylasEnv.config.get(`${TutorialConfig.getConfigKey(name)}.state`) || 'new';
  },
  setState: (name, state) => {
    return NylasEnv.config.set(`${TutorialConfig.getConfigKey(name)}.state`, state);
  },
  getStepIndex: (name) => {
    return NylasEnv.config.get(`${TutorialConfig.getConfigKey(name)}.stepIndex`) || 0;
  },
  setStepIndex: (name, stepIndex) => {
    return NylasEnv.config.set(`${TutorialConfig.getConfigKey(name)}.stepIndex`, stepIndex);
  },
  observe: (name, key, callback) => {
    return NylasEnv.config.observe(`${TutorialConfig.getConfigKey(name)}.${key}`, callback);
  },
  onDidChange: (name, key, callback) => {
    return NylasEnv.config.onDidChange(`${TutorialConfig.getConfigKey(name)}.${key}`, callback);
  },
}

const SEGMENT_ORDERS = {
  'default': ['open-tracking', 'open-sidebar', 'scheduler'],
  'composer': ['open-tracking', 'scheduler'],
}

class TutorialStore extends NylasStore {
  constructor() {
    super();

    this.currentSegmentName = null;
    this.runningStep = null;
    this.nextStepDisposable = null;
    this.nextSegmentDisposable = null;
    this.registry = {};

    NylasEnv.onWindowPropsReceived(this._checkWindow);
    this._checkWindow(); // In case windowType has already been set
  }

  // Segment Registry - this is exposed as service by the main file
  addSegment(name, segment) {
    this.registry[name] = segment;
    this._onDidAddSegment();
  }

  removeSegment(name) {
    delete this.registry[name]
  }

  getSteps = (name) => this.registry[name];
  hasSegment = (name) => this.registry[name] != null;
  getSegmentNames = () => Object.keys(this.registry);

  // Figure out what tutorial segments we should expect based on the window type
  _checkWindow = () => {
    // Only need to do this if we haven't already figured out the segment order
    if (!this.segmentOrder) {
      const windowType = NylasEnv.getWindowType();
      if (windowType !== 'emptyWindow') {
        if (windowType in SEGMENT_ORDERS) {
          this.segmentOrder = SEGMENT_ORDERS[windowType];
          this._activateNextSegment();
        }
      }
    }
  }

  _activateNextSegment = () => {
    // Starting a new segment, don't want to listen to the old segment's disposables
    if (this.nextStepDisposable) {
      this.nextStepDisposable.dispose();
      this.nextStepDisposable = null;
    }
    if (this.nextSegmentDisposable) {
      this.nextSegmentDisposable.dispose();
      this.nextSegmentDisposable = null;
    }

    // Find the first registered segment that is still 'new'
    for (const name of this.segmentOrder) {
      if (this.hasSegment(name)) {
        const state = TutorialConfig.getState(name);
        if (state === 'new') {
          this.currentSegmentName = name;
          // Communicate across windows when a step or the entire segment has been compeleted
          // (The observe one will be fired immediately, so we go straight to the first step)
          this.nextStepDisposable = TutorialConfig.observe(name, 'stepIndex', this._nextStep);
          this.nextSegmentDisposable = TutorialConfig.onDidChange(name, 'state', this._activateNextSegment);
          return;
        }
      } else {
        // An expected segment hasn't been registered. Assume plugins are still
        // registering and don't proceed.
        this.currentSegmentName = null;
        return;
      }
    }
  }

  _nextStep = () => {
    this._clearRender();
    const stepIndex = TutorialConfig.getStepIndex(this.currentSegmentName);
    const steps = this.getSteps(this.currentSegmentName);
    if (stepIndex >= steps.length) {
      // No more steps! Go to the next segment
      this._endSegment();
      return;
    }
    const step = steps[stepIndex];
    // Only perform steps in their intended window
    if (NylasEnv.getWindowType() === step.windowType) {
      this.runningStep = step.perform(this._render, this._clearRender).then(() => {
        this.runningStep = null;
        // triggers _nextStep() in all windows
        TutorialConfig.setStepIndex(this.currentSegmentName, stepIndex + 1);
      });
      // Double check that the step has an abort method for skipping
      if (!this.runningStep.abort) {
        throw new Error("Tutorial steps must have abort methods. Step object: ", this.runningStep);
      }
    }
  }

  _skip = () => {
    // Halt the current step
    this.runningStep.abort();
    this.runningStep = null;
    this._clearRender();

    // triggers _activateNextSegment() in all windows
    TutorialConfig.setState(this.currentSegmentName, 'skipped');
  }

  _endSegment = () => {
    // triggers _activateNextSegment() in all windows
    TutorialConfig.setState(this.currentSegmentName, 'done');
  }

  // Called when segments are registered with the this
  _onDidAddSegment = () => {
    if (!this.currentSegmentName) {
      // If we don't have a current segment, it's possible we're waiting for
      // this one. Try activating.
      this._activateNextSegment();
    }
  }

  _clearRender = () => {
    this.activeStep = null;
    this.trigger()
  }

  _render = (targetIdentifier, title, instructions, {fromSide = false} = {}) => {
    this.activeStep = {targetIdentifier, title, instructions, fromSide};
    this.trigger()
  }
}

export default new TutorialStore();
