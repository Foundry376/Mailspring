import { RetinaImg } from 'mailspring-component-kit';
import { React, PropTypes, Actions } from 'mailspring-exports';

class DraftDeleteButton extends React.Component {
  static displayName = 'DraftDeleteButton';
  static containerRequired = false;

  static propTypes = {
    selection: PropTypes.object.isRequired,
    buttonTimer: PropTypes.number,
  };
  static default = {
    buttonTimer: 500, //in milliseconds
  };

  constructor(props) {
    super(props);
    this.state = {
      isDeleting: false,
    };
    this._mounted = false;
    this._deletingTimer = false;
    this._deleteTimestamp = 0;
  }
  componentDidMount() {
    this._mounted = true;
  }
  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._deletingTimer);
  }
  _changeBackToNotDeleting = () => {
    if (Date.now() - this._deleteTimestamp > this.props.buttonTimer) {
      clearTimeout(this._deletingTimer);
      this._deletingTimer = setTimeout(() => {
        if(this._mounted){
          this.setState({ isDeleting: false });
        }
      }, this.props.buttonTimer);
      this._deleteTimestamp = Date.now();
    }
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
          mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }

  _onDestroySelected = () => {
    if (!this.state.isDeleting) {
      this.setState({ isDeleting: true }, this._changeBackToNotDeleting);
      for (const item of this.props.selection.items()) {
        Actions.destroyDraft(item);
      }
      this.props.selection.clear();
    }
    return;
  };
}

module.exports = { DraftDeleteButton };
