import _ from 'underscore';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ListensToObservable } from 'mailspring-component-kit';
import { localized } from 'mailspring-exports';
import ThreadListStore from './thread-list-store';

function getObservable() {
  return ThreadListStore.selectionObservable().map(items => items.length);
}

function getStateFromObservable(selectionCount) {
  if (!selectionCount) {
    return { selectionCount: 0 };
  }
  return { selectionCount };
}

class SelectedItemsStack extends Component<{ selectionCount: number }> {
  static displayName = 'SelectedItemsStack';

  static propTypes = {
    selectionCount: PropTypes.number,
  };

  static containerRequired = false;

  onClearSelection = () => {
    ThreadListStore.dataSource().selection.clear();
  };

  render() {
    const { selectionCount } = this.props;
    if (selectionCount <= 1) {
      return <span />;
    }
    const cardCount = Math.min(5, selectionCount);

    return (
      <div className="selected-items-stack">
        <div className="selected-items-stack-content">
          <div className="stack">
            {_.times(cardCount, idx => {
              let deg = idx * 0.9;

              if (idx === 1) {
                deg += 0.5;
              }
              let transform = `rotate(${deg}deg)`;
              if (idx === cardCount - 1) {
                transform += ' translate3d(2px, 3px, 0)';
              }
              const style = {
                transform,
                zIndex: 5 - idx,
              };
              return (
                <div key={`card-${idx}`} style={style} className="card">
                  <svg width="100%" height="100%" viewBox="0 0 390 527" version="1.1">
                    <rect strokeWidth="2.5" x="0" y="0" width="390" height="527" rx="15" />
                  </svg>
                </div>
              );
            })}
          </div>
          <div className="count-info">
            <div className="count">{selectionCount}</div>
            <div className="count-message">{localized('Selected Messages')}</div>
            <div className="clear btn" onClick={this.onClearSelection}>
              {localized('Clear Selection')}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ListensToObservable(SelectedItemsStack, { getObservable, getStateFromObservable });
