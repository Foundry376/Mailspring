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
  hasFinishedSegment: (name) => (NylasEnv.config.get('core.tutorial.seen') || []).includes(name),

  didFinishSegment: (name) => NylasEnv.config.pushAtKeyPath('core.tutorial.seen', name),

  didSkipSegment: (name) => NylasEnv.config.pushAtKeyPath('core.tutorial.seen', name),

  getStepIndex: () => {
    const [segment, index] = (NylasEnv.config.get('core.tutorial.index') || ':').split(':')
    return {segment, index};
  },
  setStepIndex: (segment, index) => {
    NylasEnv.config.set('core.tutorial.index', `${segment}:${index}`)
  },
  unsetStepIndex: () => {
    NylasEnv.config.unset('core.tutorial.index')
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

    // We want to sync across windows when a step or the entire segment has been compeleted
    NylasEnv.config.onDidChange('core.tutorial.index', this._onStepIndexChanged);

    NylasEnv.onWindowPropsReceived(this.startWhenWindowReady);
    this.startWhenWindowReady();
  }

  currentOverlayConfig() {
    return this._currentOverlayConfig;
  }

  // Segment Registry - this is exposed as service by the main file

  addSegment = (name, segment) => {
    this.registry[name] = segment;

    const active = TutorialConfig.getStepIndex();
    if (active.segment !== this.findNextUnfinishedSegmentName()) {
      this.startNextUnfinishedSegment();
    }
  }

  removeSegment = (name) => {
    delete this.registry[name]
  }

  //

  findNextUnfinishedSegmentName() {
    const windowType = NylasEnv.getWindowType();
    return Object.keys(this.registry)
      .sort(name => SEGMENT_ORDERS[windowType].indexOf(name))
      .find(name => !TutorialConfig.hasFinishedSegment(name))
  }

  startWhenWindowReady() {
    const windowType = NylasEnv.getWindowType();
    if (windowType === 'emptyWindow') {
      return;
    }
    this.startNextUnfinishedSegment();
  }

  startNextUnfinishedSegment() {
    TutorialConfig.setStepIndex(this.findNextUnfinishedSegmentName(), 0);
  }

  _cleanupCurrentStep = () => {
    if (this._currentOverlayConfig) {
      this._currentOverlayConfig = null;
      this.trigger();
    }
    if (this._currentStepDisposable) {
      this._currentStepDisposable.dispose();
      this._currentStepDisposable = null;
    }
  }

  _onStepIndexChanged = () => {
    this._cleanupCurrentStep();

    const {segment, index} = TutorialConfig.getStepIndex();
    if (!segment || !this.registry[segment]) {
      return;
    }

    const step = this.registry[segment][index];

    if (!step) {
      TutorialConfig.didFinishSegment(segment);
      return;
    }

    if (NylasEnv.getWindowType() !== step.windowType) {
      return;
    }

    step.runs().then((resp) => {
      if (resp instanceof Object) {
        this._currentOverlayConfig = resp;
        this.trigger();
      }
    }).then(() => {
      const observable = step.waitsFor();
      if (observable) {
        this._currentStepDisposable = observable.subscribe(() => {
          TutorialConfig.setStepIndex(segment, index + 1);
        });
      } else {
        TutorialConfig.setStepIndex(segment, index + 1);
      }
    });
  }

  _skip = () => {
    this._cleanupCurrentStep();

    const {segment} = TutorialConfig.getStepIndex();
    TutorialConfig.didSkipSegment(segment);
  }
}

export default new TutorialStore();
