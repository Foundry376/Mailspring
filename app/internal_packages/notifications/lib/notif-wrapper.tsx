import _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import { InjectedComponentSet } from 'mailspring-component-kit';

const ROLE = 'RootSidebar:Notifications';

export default class NotifWrapper extends React.Component {
  static displayName = 'NotifWrapper';

  observer: MutationObserver;

  componentDidMount() {
    this.observer = new MutationObserver(this.update);
    this.observer.observe(ReactDOM.findDOMNode(this), { childList: true });
    this.update(); // Necessary if notifications are already mounted
  }

  componentWillUnmount() {
    this.observer.disconnect();
  }

  update = () => {
    const className = 'highest-priority';
    const node = ReactDOM.findDOMNode(this) as HTMLElement;

    const oldHighestPriorityElems = node.querySelectorAll(`.${className}`);
    for (const oldElem of Array.from(oldHighestPriorityElems)) {
      oldElem.classList.remove(className);
    }

    const elemsWithPriority = node.querySelectorAll('[data-priority]');
    if (elemsWithPriority.length === 0) {
      return;
    }

    const highestPriorityElem = _.max(elemsWithPriority, elem =>
      parseInt((elem as HTMLElement).dataset.priority, 10)
    );

    highestPriorityElem.classList.add(className);
  };

  render() {
    return (
      <InjectedComponentSet
        className="notifications"
        height=""
        matching={{ role: ROLE }}
        direction="column"
        containersRequired={false}
      />
    );
  }
}
