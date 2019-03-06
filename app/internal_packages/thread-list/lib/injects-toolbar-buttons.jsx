import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ListensToObservable, InjectedComponentSet } from 'mailspring-component-kit';
import ThreadListStore from './thread-list-store';

export const ToolbarRole = 'ThreadActionsToolbarButton';

function defaultObservable() {
  return ThreadListStore.selectionObservable();
}

function InjectsToolbarButtons(ToolbarComponent, { getObservable, extraRoles = [] }) {
  const roles = [ToolbarRole].concat(extraRoles);

  class ComposedComponent extends Component {
    static displayName = ToolbarComponent.displayName;

    static propTypes = {
      items: PropTypes.array,
    };

    static containerRequired = false;

    render() {
      const { items } = this.props;
      const dataSource = ThreadListStore.dataSource();
      const { selection } = ThreadListStore.dataSource();

      // Keep all of the exposed props from deprecated regions that now map to this one
      const exposedProps = {
        items,
        selection,
        thread: items[0],
        dataSource
      };
      const injectedButtons = (
        <InjectedComponentSet className="toolbar-buttons" key="injected" matching={{ roles }} exposedProps={exposedProps} />
      );
      return (
        <ToolbarComponent items={items} selection={selection} injectedButtons={injectedButtons} dataSource={dataSource} />
      );
    }
  }

  const getStateFromObservable = items => {
    if (!items) {
      return { items: [] };
    }
    return { items };
  };
  return ListensToObservable(ComposedComponent, {
    getObservable: getObservable || defaultObservable,
    getStateFromObservable,
  });
}

export default InjectsToolbarButtons;