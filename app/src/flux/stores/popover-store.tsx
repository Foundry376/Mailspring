import React from 'react';
import ReactDOM from 'react-dom';
import MailspringStore from 'mailspring-store';
import * as Actions from '../actions';
import FixedPopover from '../../components/fixed-popover';

const CONTAINER_ID = 'mailspring-popover-container';

function createContainer(id) {
  const element = document.createElement(id);
  document.body.insertBefore(element, document.body.children[0]);
  return element;
}

class PopoverStore extends MailspringStore {
  isOpen = false;
  container: HTMLElement;

  constructor(containerId = CONTAINER_ID) {
    super();
    this.container = createContainer(containerId);
    ReactDOM.render(<span />, this.container);

    this.listenTo(Actions.openPopover, this.openPopover);
    this.listenTo(Actions.closePopover, this.closePopover);
  }

  renderPopover = (child, props, callback) => {
    const popover = <FixedPopover {...props}>{child}</FixedPopover>;

    ReactDOM.render(popover, this.container, () => {
      this.isOpen = true;
      this.trigger();
      callback();
    });
  };

  openPopover = (
    element,
    { originRect, direction, fallbackDirection, closeOnAppBlur, callback = () => {} }
  ) => {
    const props = {
      direction,
      originRect,
      fallbackDirection,
      closeOnAppBlur,
    };

    if (this.isOpen) {
      this.closePopover(() => {
        this.renderPopover(element, props, callback);
      });
    } else {
      this.renderPopover(element, props, callback);
    }
  };

  closePopover = (callback = () => {}) => {
    ReactDOM.render(<span />, this.container, () => {
      this.isOpen = false;
      this.trigger();
      callback();
    });
  };
}

export default new PopoverStore();
