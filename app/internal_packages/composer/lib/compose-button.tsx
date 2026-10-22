import React from 'react';
import { localized, Actions } from 'mailspring-exports';
import { LabelledToolbarButton } from 'mailspring-component-kit';

export default class ComposeButton extends React.Component {
  static displayName = 'ComposeButton';

  _onNewCompose = () => {
    Actions.composeNewBlankDraft();
  };

  render() {
    return (
      <LabelledToolbarButton
        className="item-compose"
        iconName="toolbar-compose.png"
        label={localized('Compose')}
        title={localized('Compose new message')}
        onClick={this._onNewCompose}
      />
    );
  }
}
