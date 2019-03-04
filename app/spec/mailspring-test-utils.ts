/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// Utils for testing.
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';

const MailspringTestUtils = {
  loadKeymap: path => {
    return AppEnv.keymaps.loadKeymap(path);
  },

  simulateCommand: (target, command) => {
    return target.dispatchEvent(new CustomEvent(command, { bubbles: true }));
  },

  // React's "renderIntoDocument" does not /actually/ attach the component
  // to the document. It's a sham: http://dragon.ak.fbcdn.net/hphotos-ak-xpf1/t39.3284-6/10956909_1423563877937976_838415501_n.js
  // The Atom keymap manager doesn't work correctly on elements outside of the
  // DOM tree, so we need to attach it.
  renderIntoDocument(component) {
    const node = ReactTestUtils.renderIntoDocument(component);
    const $node = ReactDOM.findDOMNode(node);
    if (!document.body.contains($node)) {
      let parent: any = $node;
      while (parent.parentNode != null) {
        parent = parent.parentNode;
      }
      document.body.appendChild(parent);
    }
    return node;
  },

  removeFromDocument(reactElement) {
    const $el = ReactDOM.findDOMNode(reactElement) as HTMLElement;
    if (document.body.contains($el)) {
      for (let child of Array.from(document.body.childNodes)) {
        if (child.contains($el)) {
          document.body.removeChild(child);
          return;
        }
      }
    }
  },

  // Returns mock observable that triggers immediately and provides helper
  // function to trigger later
  mockObservable(data, param) {
    if (param == null) {
      param = {};
    }
    let { dispose } = param;
    if (dispose == null) {
      dispose = function() {};
    }
    let func = function(data) {};
    return {
      subscribe(fn) {
        func = fn;
        func(data);
        return { dispose };
      },
      triggerNext(nextData) {
        if (nextData == null) {
          nextData = data;
        }
        return func(nextData);
      },
    };
  },
};
export default MailspringTestUtils;
