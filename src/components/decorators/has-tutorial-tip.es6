import React from 'react'
import TutorialStore from '../../tutorial-store';

function HasTutorialTip(ComposedComponent) {
  if (TutorialStore.hasSeenTip(ComposedComponent.displayName)) {
    return ComposedComponent;
  }

  return class extends ComposedComponent {
    static displayName = ComposedComponent.displayName

    render() {
      return (
        <ComposedComponent
          {...this.props}
          focusElementWithTabIndex={::this.focusElementWithTabIndex}
        />
      )
    }
  }
}

export default HasTutorialTip
