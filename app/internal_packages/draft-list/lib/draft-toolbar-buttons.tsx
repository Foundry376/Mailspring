import React from 'react';
import { RetinaImg } from 'mailspring-component-kit';
import { localized, PropTypes, Actions } from 'mailspring-exports';

export class DraftDeleteButton extends React.Component<{ selection: any }> {
  static displayName = 'DraftDeleteButton';
  static containerRequired = false;

  static propTypes = {
    selection: PropTypes.object.isRequired,
  };

  render() {
    return (
      <button
        style={{ order: -100 }}
        className="btn btn-toolbar"
        title={localized('Delete')}
        aria-label={localized('Delete')}
        onClick={this._onDestroySelected}
      >
        <RetinaImg name="icon-composer-trash.png" mode={RetinaImg.Mode.ContentIsMask} aria-hidden="true" />
      </button>
    );
  }

  _onDestroySelected = () => {
    for (const item of this.props.selection.items()) {
      Actions.destroyDraft(item);
    }
    this.props.selection.clear();
    return;
  };
}
