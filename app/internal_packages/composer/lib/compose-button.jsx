import React from 'react';
import { Actions } from 'mailspring-exports';
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
        title="Compose new message"
        onClick={this._onNewCompose}
      >
        <RetinaImg name={'email.svg'}
          style={{ width: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
        <span>Compose</span>
      </button>
    );
  }
}
