import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ListensToObservable, InjectedComponentSet } from 'mailspring-component-kit';
import ThreadListStore from './thread-list-store';
import { FocusedPerspectiveStore } from 'mailspring-exports';

export const ToolbarRole = 'MailActionsToolbarButton';

function defaultObservable() {
  return ThreadListStore.selectionObservable();
}

function InjectsToolbarButtons(
  ToolbarComponent,
  { getObservable, extraRoles = [], onEmpty = null }
) {
  const emptyMatching = onEmpty ? onEmpty : null;
  const roles = [ToolbarRole].concat(extraRoles);

  class ComposedComponent extends Component {
    static displayName = `${ToolbarComponent.displayName}`;

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
        dataSource,
        currentPerspective: FocusedPerspectiveStore.current(),
        position: this.props.position ? this.props.position : 'unknown',
      };
      const injectedButtons = (
        <InjectedComponentSet
          className="toolbar-buttons"
          key="injected"
          matching={{ roles }}
          exposedProps={exposedProps}
        />
      );
      let onEmptyButtons = [];
      if (emptyMatching) {
        onEmptyButtons = (
          <InjectedComponentSet
            className="toolbar-buttons"
            key="injected"
            matching={emptyMatching}
            exposedProps={exposedProps}
          />
        );
      }
      return (
        <ToolbarComponent
          items={items}
          selection={selection}
          injectedButtons={injectedButtons}
          dataSource={dataSource}
          onEmptyButtons={onEmptyButtons}
        />
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
