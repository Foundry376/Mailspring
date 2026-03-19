import React from 'react';
import { localized, PropTypes, Utils } from 'mailspring-exports';

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

  componentDidUpdate(prevProps: { copyValue: string; btnLabel: string }) {
    if (prevProps.btnLabel !== this.props.btnLabel) {
      clearTimeout(this._timeout);
      this._timeout = null;
      this.setState({ btnLabel: this.props.btnLabel });
    }
  }

  componentWillUnmount() {
    clearTimeout(this._timeout);
  }

  _onCopy = () => {
    if (this._timeout) {
      return;
    }
    const { copyValue, btnLabel } = this.props;
    // Use a truthy sentinel to block re-entry while the async write is in-flight.
    // clearTimeout(true) is a safe no-op, so componentWillUnmount is unaffected.
    this._timeout = true as any;
    navigator.clipboard
      .writeText(copyValue)
      .then(() => {
        this.setState({ btnLabel: localized('Copied') });
        this._timeout = setTimeout(() => {
          this._timeout = null;
          this.setState({ btnLabel: btnLabel });
        }, 2000);
      })
      .catch(() => {
        this._timeout = null;
      });
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
