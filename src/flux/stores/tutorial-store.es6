/*
  To add a tutorial segment, you need to register it with the TutorialRegistry
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


import React from 'react';
import ReactDOM from 'react-dom';
import NylasStore from 'nylas-store';
import TutorialRegistry from '../../tutorial-registry';
import {TutorialOverlay} from 'nylas-component-kit';
import {TutorialUtils} from 'nylas-exports';
const {AbortablePromise, TutorialConfig} = TutorialUtils;

const SEGMENT_ORDERS = {
  'default': ['open-tracking', 'open-sidebar', 'scheduler'],
  'composer': ['open-tracking', 'scheduler'],
}

class TutorialStore extends NylasStore {
  constructor() {
    super();
    this.container = document.createElement("nylas-tutorial-container")
    document.body.appendChild(this.container);

    this.currentSegmentName = null;
    this.runningStep = null;
    this.nextStepDisposable = null;
    this.nextSegmentDisposable = null;

    NylasEnv.onWindowPropsReceived(this._checkWindow);
    this._checkWindow(); // In case windowType has already been set
  }

  // Figure out what tutorial segments we should expect based on the window type
  _checkWindow = () => {
    // Only need to do this if we haven't already figured out the segment order
    if (!this.segmentOrder) {
      const windowType = NylasEnv.getWindowType();
      if (windowType !== 'emptyWindow') {
        if (windowType in SEGMENT_ORDERS) {
          this.segmentOrder = SEGMENT_ORDERS[windowType];
          TutorialRegistry.listen(this._addSegment);
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
      if (TutorialRegistry.hasSegment(name)) {
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
    const steps = TutorialRegistry.getSteps(this.currentSegmentName);
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

  // TThe bounding rectangle of an element can change as its contents load,
  // and _render() should depend on the final bounding rectangle state.
  // Resolves after the bounding rectangle is 'stable', that is, the same for
  // <MIN_STABLE_COUNT> polls at <POLL_INTERVAL>(ms) long intervals.
  _waitForBoundsStability(elem) {
    const MIN_STABLE_COUNT = 3;
    const POLL_INTERVAL = 500;
    let timeout;

    return new AbortablePromise((resolve) => {
      let lastBounds = {};
      let stabilityCount = 0;

      const pollBounds = () => {
        const bounds = elem.getBoundingClientRect();
        let same = true;
        // check the values of each key to see if any are different
        for (const key of Object.keys(bounds)) {
          if (bounds[key] !== lastBounds[key]) {
            same = false;
            break;
          }
        }
        lastBounds = bounds;

        if (same) {
          stabilityCount++;
          if (stabilityCount >= MIN_STABLE_COUNT) {
            resolve(elem);
            return;
          }
        } else {
          stabilityCount = 0;
        }
        timeout = setTimeout(pollBounds, POLL_INTERVAL);
      }
      pollBounds();
    }, () => { clearTimeout(timeout); });
  }

  // Called when segments are registered with the TutorialRegistry
  _addSegment = () => {
    if (!this.currentSegmentName) {
      // If we don't have a current segment, it's possible we're waiting for
      // this one. Try activating.
      this._activateNextSegment();
    }
  }

  // Clear out the tutorial GUI
  _clearRender = () => {
    const content = <div></div>;
    ReactDOM.render(content, this.container);
  }

  // Display a TutorialOverlay
  _render = (identifier, title, instructions, {isGenericSelector = false, fromSide = false} = {}) => {
    return TutorialUtils.findElementIfNecessary(identifier, isGenericSelector)
      .then(this._waitForBoundsStability).then(() => {
        const content = (
          <TutorialOverlay
            title={title}
            targetIdentifier={identifier}
            useGenericSelector={isGenericSelector}
            fromSide={fromSide}
          >
            <div className="tutorial-instructions" dangerouslySetInnerHTML={{ __html: instructions}} ></div>
            <div className="tutorial-skip" onClick={this._skip}>
              Skip
            </div>
          </TutorialOverlay>
        )

        ReactDOM.render(content, this.container);
      });
  }

}

export default new TutorialStore();
