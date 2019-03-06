import React from 'react';
import ReactDOM from 'react-dom';
import MailspringStore from 'mailspring-store';
import Actions from '../actions';
import FixedPopover from '../../components/fixed-popover';

const CONTAINER_ID = 'nylas-popover-container';

function createContainer(id) {
  const element = document.createElement(id);
  document.body.insertBefore(element, document.body.children[0]);
  return element;
}

class PopoverStore extends MailspringStore {
  constructor(containerId = CONTAINER_ID) {
    super();
    this.isOpen = false;
    this.container = createContainer(containerId);
    ReactDOM.render(<span/>, this.container);

    this.listenTo(Actions.openPopover, this.openPopover);
    this.listenTo(Actions.closePopover, this.closePopover);
  }

  renderPopover = (
    child,
    props,
    callback,
    opts = { isFixedToWindow: false, position: { left: 0, top: 0 } },
  ) => {
    if (opts.isFixedToWindow) {
      props.position = opts.position;
    }
    const popover = <FixedPopover {...props}>{child}</FixedPopover>;

    ReactDOM.render(popover, this.container, () => {
      this.isOpen = true;
      this.trigger();
      callback();
    });
  };

  openPopover = (
    element,
    {
      originRect, direction, fallbackDirection, closeOnAppBlur, disablePointer, isFixedToWindow = false, position = {}, onClose = () => {
    }, callback = () => {
    },
    },
  ) => {
    const props = {
      direction,
      originRect,
      fallbackDirection,
      closeOnAppBlur,
      onClose,
      disablePointer,
      isFixedToWindow,
    };

    if (this.isOpen) {
      this.closePopover(() => {
        this.renderPopover(element, props, callback, { isFixedToWindow, position });
      });
    } else {
      this.renderPopover(element, props, callback, { isFixedToWindow, position });
    }
  };

  closePopover = (callback = () => {
  }) => {
    ReactDOM.render(<span/>, this.container, () => {
      this.isOpen = false;
      this.trigger();
      callback();
    });
  };
}

export default new PopoverStore();
