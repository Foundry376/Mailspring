import { RetinaImg } from 'mailspring-component-kit';
import { React, PropTypes, Actions } from 'mailspring-exports';

class DraftDeleteButton extends React.Component {
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
        title="Delete"
        onClick={this._onDestroySelected}
      >
        <RetinaImg name="icon-composer-trash.png" mode={RetinaImg.Mode.ContentIsMask} />
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

module.exports = { DraftDeleteButton };
