import React from 'react';
import ReactDOM from 'react-dom';

export default class AutofocusContainer extends React.Component {
  static propTypes = {
    children: React.PropTypes.children,
  }

  componentDidMount() {
    this._applyFocus();
  }

  componentDidUpdate() {
    this._applyFocus();
  }

  _applyFocus() {
    const firstInput = ReactDOM.findDOMNode(this).querySelector('input');
    const anyInputFocused = document.activeElement && document.activeElement.nodeName === 'INPUT';

    if (firstInput && !anyInputFocused) {
      firstInput.focus();
    }
  }

  render() {
    return (<div>{this.props.children}</div>);
  }
}
