import React from 'react';
import ReactDOM from 'react-dom';

import TutorialContainer from './tutorial-container';
import TutorialStore from './tutorial-store';

import {ServiceRegistry} from 'nylas-exports';


export function activate() {
  this.container = document.createElement("nylas-tutorial-container")
  document.body.appendChild(this.container);
  ReactDOM.render(<TutorialContainer />, this.container);

  ServiceRegistry.registerService('tutorial', {
    addSegment: TutorialStore.addSegment,
    removeSegment: TutorialStore.removeSegment,
  })
}

export function deactivate() {
  document.body.removeChild(this.container);
  ServiceRegistry.unregisterService('tutorial')
}
