import React from 'react';
import ReactDOM from 'react-dom';

let compositionActive = false;
document.addEventListener('compositionstart', () => {
  compositionActive = true;
});
document.addEventListener('compositionend', () => {
  compositionActive = false;
});

export const TabGroupContext = React.createContext<TabGroupRegion | null>(null);

export class TabGroupRegion extends React.Component<React.HTMLProps<HTMLDivElement>> {
  _onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    if (compositionActive) return;
    const dir = event.shiftKey ? -1 : 1;
    this.shiftFocus(dir);
    event.preventDefault();
    event.stopPropagation();
  };

  shiftFocus = (dir) => {
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

      if (node.tabIndex === -1 && !node.isContentEditable) {
        continue;
      }
      node.focus();
      if (this._shouldSelectEnd(node)) {
        node.setSelectionRange(node.value.length, node.value.length);
      }
      return;
    }
  };

  _shouldSelectEnd = (node: HTMLInputElement) => {
    return (
      node.nodeName === 'INPUT' && node.type === 'text' && !node.classList.contains('no-select-end')
    );
  };

  render() {
    return (
      <div {...this.props} onKeyDown={this._onKeyDown}>
        <TabGroupContext.Provider value={this}>{this.props.children}</TabGroupContext.Provider>
      </div>
    );
  }
}
