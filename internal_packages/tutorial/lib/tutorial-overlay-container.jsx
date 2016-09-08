import React from 'react';

import TutorialOverlay from './tutorial-overlay';
import TutorialStore from './tutorial-store';

export default class TutorialOverlayContainer extends React.Component {
  constructor(props) {
    super(props);
    this.state = this.getStateFromStores();
  }

  componentDidMount() {
    TutorialStore.listen(() => {
      this.setState(this.getStateFromStores())
    });
  }

  getStateFromStores() {
    return {
      step: TutorialStore.currentOverlayConfig(),
    };
  }

  render() {
    if (this.state.step) {
      const {title, fromSide, instructions, selector} = this.state.step;
      return (
        <TutorialOverlay title={title} target={selector} fromSide={fromSide}>
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
