/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

class TabGroupRegion extends React.Component {
  static childContextTypes = { parentTabGroup: PropTypes.object };

  _onKeyDown = event => {
    if (event.key === 'Tab' && !event.defaultPrevented) {
      const dir = event.shiftKey ? -1 : 1;
      this.shiftFocus(dir);
      event.preventDefault();
      event.stopPropagation();
    }
  };

  shiftFocus = dir => {
    const nodes = (ReactDOM.findDOMNode(this) as Element).querySelectorAll(
      'input, textarea, [contenteditable], [tabIndex]'
    );
    const current = document.activeElement;
    let idx = Array.from(nodes).indexOf(current);

    for (
      let i = 0, end = nodes.length, asc = 0 <= end;
      asc ? i <= end : i >= end;
      asc ? i++ : i--
    ) {
      idx = idx + dir;
      if (idx < 0) {
        idx = nodes.length - 1;
      } else {
        idx = idx % nodes.length;
      }

      const node = nodes[idx] as HTMLInputElement;

      if (node.tabIndex === -1) {
        continue;
      }
      node.focus();
      if (this._shouldSelectEnd(node)) {
        node.setSelectionRange(node.value.length, node.value.length);
      }
      return;
    }
  };

  _shouldSelectEnd = node => {
    return (
      node.nodeName === 'INPUT' && node.type === 'text' && !node.classList.contains('no-select-end')
    );
  };

  getChildContext() {
    return { parentTabGroup: this };
  }

  render() {
    return (
      <div {...this.props} onKeyDown={this._onKeyDown}>
        {this.props.children}
      </div>
    );
  }
}

export default TabGroupRegion;
