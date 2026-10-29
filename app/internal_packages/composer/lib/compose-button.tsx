import React from 'react';
import { localized, Actions } from 'mailspring-exports';
import { NewItemButton } from 'mailspring-component-kit';

export default class ComposeButton extends React.Component {
  static displayName = 'ComposeButton';

  _onNewCompose = () => {
    Actions.composeNewBlankDraft();
  };

  render() {
    return (
      <NewItemButton
        label={localized('Compose')}
        title={localized('Compose new message')}
        matchWidthOf={[localized('New Event')]}
        onClick={this._onNewCompose}
      />
    );
  }
}
