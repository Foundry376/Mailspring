import { RetinaImg } from 'mailspring-component-kit';
import { React, PropTypes, Actions, } from 'mailspring-exports';

const buttonTimer = 500;

class DraftDeleteButton extends React.Component {
  static displayName = 'DraftDeleteButton';
  static containerRequired = false;

  static propTypes = {
    selection: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);
    this.state = {
      isDeleting: false,
    };
    this._mounted = false;
    this._deletingTimer = false;
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._deletingTimer);
  }

  _changeBackToNotDeleting = () => {
    if (this._deletingTimer) {
      return;
    }
    this._deletingTimer = setTimeout(() => {
      if (this._mounted) {
        this.setState({ isDeleting: false });
      }
      this._deletingTimer = null;
    }, buttonTimer);
  };

  render() {
    return (
      <button
        style={{ order: -100 }}
        className="btn btn-toolbar"
        title="Delete"
        onClick={this._onDestroySelected}
      >
        <RetinaImg name={'trash.svg'}
                   style={{ width: 24, height: 24 }}
                   isIcon
                   mode={RetinaImg.Mode.ContentIsMask}/>
      </button>
    );
  }

  _onDestroySelected = () => {
    if (!this.state.isDeleting && !this._deletingTimer) {
      this._changeBackToNotDeleting();
      this.setState({ isDeleting: true });
      Actions.destroyDraft(this.props.selection.items());
      this.props.selection.clear();
    }
    return;
  };
}

module.exports = { DraftDeleteButton };
