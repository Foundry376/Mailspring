import React from 'react';
import { localized, PropTypes, Utils } from 'mailspring-exports';
import { clipboard } from 'electron';

class CopyButton extends React.Component<
  { copyValue: string; btnLabel: string } & React.HTMLProps<HTMLButtonElement>,
  { btnLabel: string }
> {
  static propTypes = {
    btnLabel: PropTypes.string,
    copyValue: PropTypes.string,
  };

  _timeout = null;

  constructor(props) {
    super(props);
    this.state = {
      btnLabel: props.btnLabel,
    };
  }

  componentWillReceiveProps(nextProps) {
    clearTimeout(this._timeout);
    this._timeout = null;
    this.setState({ btnLabel: nextProps.btnLabel });
  }

  componentWillUnmount() {
    clearTimeout(this._timeout);
  }

  _onCopy = () => {
    if (this._timeout) {
      return;
    }
    const { copyValue, btnLabel } = this.props;
    clipboard.writeText(copyValue);
    this.setState({ btnLabel: localized('Copied') });
    this._timeout = setTimeout(() => {
      this._timeout = null;
      this.setState({ btnLabel: btnLabel });
    }, 2000);
  };

  render() {
    const { btnLabel } = this.state;
    const otherProps = Utils.fastOmit(this.props, Object.keys(CopyButton.propTypes));
    return (
      <button onClick={this._onCopy} {...otherProps}>
        {btnLabel}
      </button>
    );
  }
}
export default CopyButton;
