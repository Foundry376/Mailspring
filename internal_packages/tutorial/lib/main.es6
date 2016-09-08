import React from 'react';
import ReactDOM from 'react-dom';

import TutorialOverlayContainer from './tutorial-overlay-container';
import TutorialStore from './tutorial-store';

import {ServiceRegistry} from 'nylas-exports';


export function activate() {
  this.container = document.createElement("nylas-tutorial-container")
  document.body.appendChild(this.container);
  ReactDOM.render(<TutorialOverlayContainer />, this.container);

  ServiceRegistry.registerService('tutorial', {
    addSegment: TutorialStore.addSegment,
    removeSegment: TutorialStore.removeSegment,
  })
}

export function deactivate() {
  document.body.removeChild(this.container);
  ServiceRegistry.unregisterService('tutorial')
}
