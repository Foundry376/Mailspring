import { React, PropTypes, Actions } from 'mailspring-exports';;
import { RetinaImg } from 'mailspring-component-kit';;

class SendingCancelButton extends React.Component {
  static displayName = 'SendingCancelButton';

  static propTypes = { taskId: PropTypes.string.isRequired };

  constructor(props) {
    super(props);
    this.state = { cancelling: false };
  }

  render() {
    if (this.state.cancelling) {
      return (
        <RetinaImg
          style={{ width: 20, height: 20, marginTop: 2 }}
          name="inline-loading-spinner.gif"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      );
    } else {
      return (
        <div onClick={this._onClick} style={{ marginTop: 1 }}>
          <RetinaImg name="image-cancel-button.png" mode={RetinaImg.Mode.ContentPreserve} />
        </div>
      );
    }
  }

  _onClick = () => {
    Actions.cancelTask(this.props.taskId);
    this.setState({ cancelling: true });
  };
}

export default SendingCancelButton;
