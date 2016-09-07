import React from 'react';

import TutorialOverlay from './tutorial-overlay';
import TutorialUtils from './tutorial-utils';
import TutorialStore from './tutorial-store';

export default class TutorialContainer extends React.Component {
  constructor() {
    this.state = this.getStateFromStores();
    this.retryTimer = null;
  }

  componentDidMount() {
    TutorialStore.listen(() => {
      this.setState(this.getStateFromStores())
    });
  }

  componentDidUpdate() {
    if (this.state.step && !this.state.el) {
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        const retryState = this.getStateFromStores();
        if ((retryState.step !== this.state.step) || (retryState.el !== this.state.el)) {
          this.setState(retryState);
        }
      });
    }
  }

  componentWillUnmount() {
    clearTimeout(this.retryTimer);
  }

  getStateFromStores() {
    const step = TutorialStore.activeStep();
    const el = TutorialUtils.findElement(step.targetIdentifier);
    return { step, el };
  }

  render() {
    const {el, step} = this.state;

    if (step && el) {
      const {title, fromSide, instructions} = step;
      return (
        <TutorialOverlay title={title} target={el} fromSide={fromSide}>
          <div className="tutorial-instructions" dangerouslySetInnerHTML={{ __html: instructions}} ></div>
          <div className="tutorial-skip" onClick={this._skip}>
            Skip
          </div>
        </TutorialOverlay>
      );
    }
    return (
      <span></span>
    );
  }
}
