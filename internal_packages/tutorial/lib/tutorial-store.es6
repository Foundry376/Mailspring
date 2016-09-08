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
import Rx from 'rx-lite';

// Helper functions for accessing the tutorial-specific parts of the config
const TutorialConfig = {
  hasFinishedSegment: (name) => (NylasEnv.config.get('core.tutorial.seen') || []).includes(name),

  didFinishSegment: (name) => NylasEnv.config.pushAtKeyPath('core.tutorial.seen', name),

  didSkipSegment: (name) => NylasEnv.config.pushAtKeyPath('core.tutorial.seen', name),

  getStepIndex: () => {
    const [segment, index] = (NylasEnv.config.get('core.tutorial.index') || ':').split(':')
    return {
      segment: segment,
      index: index / 1,
    };
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

    // Sync across windows when a step or the entire segment has been completed
    NylasEnv.config.onDidChange('core.tutorial.index', this._runCurrentStep);

    // Start the tutorial once packages have loaded for our final window type
    NylasEnv.packages.onDidActivateInitialPackages(() => {
      const windowType = NylasEnv.getWindowType();
      if ((windowType === 'emptyWindow') || (windowType.includes('preload'))) {
        return;
      }

      process.nextTick(() => this.onStart());
    });
  }

  onStart() {
    const {segment} = TutorialConfig.getStepIndex();
    if (!segment || NylasEnv.isMainWindow()) {
      this._runFirstUnfinishedSegment();
    } else {
      this._runCurrentStep();
    }
  }

  currentOverlayConfig() {
    return this._currentOverlayConfig;
  }

  // Segment Registry - this is exposed as service by the main file

  addSegment = (name, segment) => {
    this.registry[name] = segment;
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

  _runFirstUnfinishedSegment = () => {
    const segment = this.findNextUnfinishedSegmentName();
    if (segment) {
      TutorialConfig.setStepIndex(segment, 0);
    }
  }

  _runCurrentStep = () => {
    this._cleanupCurrentStep();

    const {segment, index} = TutorialConfig.getStepIndex();
    if (!segment || !this.registry[segment]) {
      console.log(`Could not find segment: ${segment}`)
      return;
    }

    const step = this.registry[segment][index];

    if (!step) {
      console.log(`Could not find step: ${segment} ${index}`)
      TutorialConfig.didFinishSegment(segment);
      this._runFirstUnfinishedSegment();
      return;
    }

    if (NylasEnv.getWindowType() !== step.windowType) {
      console.log(`Step is not intended for window type.`)
      return;
    }

    const result = step.run({
      setOverlay: (overlayConfig) => {
        this._currentOverlayConfig = overlayConfig;
        this.trigger();
      },
    });

    if (result && (result instanceof Rx.Observable)) {
      this._currentStepDisposable = result.subscribe(() => {
        TutorialConfig.setStepIndex(segment, index + 1);
      });
    } else {
      TutorialConfig.setStepIndex(segment, index + 1);
    }
  }

  _skip = () => {
    this._cleanupCurrentStep();

    const {segment} = TutorialConfig.getStepIndex();
    TutorialConfig.didSkipSegment(segment);
  }
}

const ts = new TutorialStore();
window.TutorialStore = ts;
export default ts;
