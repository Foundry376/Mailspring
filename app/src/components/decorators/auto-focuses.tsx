import _ from 'underscore';
import React from 'react';
import { findDOMNode } from 'react-dom';

const FOCUSABLE_SELECTOR = 'input, textarea, [contenteditable], [tabIndex]';

function AutoFocuses(
  ComposedComponent: React.ComponentClass<{ focusElementWithTabIndex }> & {
    containerRequired?;
    containerStyles?;
  },
  { onMount = true, onUpdate = true } = {}
) {
  return class extends ComposedComponent {
    static displayName = ComposedComponent.displayName;
    static containerRequired = ComposedComponent.containerRequired;
    static containerStyles = ComposedComponent.containerStyles;
    mounted = false;

    componentDidMount() {
      this.mounted = true;
      if (onMount) {
        this.focusElementWithTabIndex();
      }
    }

    componentWillUnmount() {
      this.mounted = false;
    }

    componentDidUpdate() {
      if (onUpdate) {
        this.focusElementWithTabIndex();
      }
    }

    isFocusable(currentNode = findDOMNode(this)) {
      (currentNode as HTMLElement).focus();
      return document.activeElement === currentNode;
    }

    focusElementWithTabIndex = () => {
      if (!this.mounted) {
        return;
      }
      // Automatically focus the element inside us with the lowest tab index
      const currentNode = findDOMNode(this) as HTMLElement;
      if (currentNode.contains(document.activeElement)) {
        return;
      }

      if (this.isFocusable(currentNode)) {
        currentNode.focus();
        return;
      }

      // _.sortBy ranks in ascending numerical order.
      const focusable = currentNode.querySelectorAll(FOCUSABLE_SELECTOR);
      const matches = _.sortBy(focusable, _node => {
        const node = _node as HTMLElement;
        if (node.tabIndex > 0) {
          return node.tabIndex;
        } else if (node.nodeName === 'INPUT') {
          return 1000000;
        }
        return 1000001;
      });
      if (matches[0]) {
        (matches[0] as HTMLElement).focus();
      }
    };

    render() {
      return (
        <ComposedComponent
          {...this.props}
          focusElementWithTabIndex={this.focusElementWithTabIndex}
        />
      );
    }
  };
}

export default AutoFocuses;
