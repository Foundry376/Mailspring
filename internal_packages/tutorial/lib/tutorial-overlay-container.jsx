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
      tip: TutorialStore.currentTip(),
    };
  }

  render() {
    if (this.state.tip) {
      const {title, fromSide, instructions, selector} = this.state.tip;
      return (
        <TutorialOverlay
          title={title}
          target={selector}
          fromSide={fromSide}
          instructions={instructions}
        />
      );
    }
    return (
      <span></span>
    );
  }
}
