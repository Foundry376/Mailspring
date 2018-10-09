import React from 'react';
import { localized, Actions } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

export default class ComposeButton extends React.Component {
  static displayName = 'ComposeButton';

  _onNewCompose = () => {
    Actions.composeNewBlankDraft();
  };

  render() {
    return (
      <button
        className="btn btn-toolbar item-compose"
        title={localized('Compose new message')}
        onClick={this._onNewCompose}
      >
        <RetinaImg name="toolbar-compose.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}
