import { Utils, localized } from 'mailspring-exports';
import React from 'react';
import { CSSTransitionGroup } from 'react-transition-group';

type MultiselectToolbarProps = {
  toolbarElement: JSX.Element;
  collection: string;
  onClearSelection: (...args: any[]) => any;
  selectionCount: number;
};

/*
 * MultiselectToolbar renders a toolbar inside a horizontal bar and displays
 * a selection count and a button to clear the selection.
 *
 * The toolbar, or set of buttons, must be passed in as props.toolbarElement
 *
 * It will also animate its mounting and unmounting
 */
function selectionLabel(selectionCount: number, collection: string) {
  if (selectionCount === 0) {
    return '';
  }
  let noun = '';
  if (collection === 'thread') {
    noun = selectionCount > 1 ? localized('Threads') : localized('Thread');
  } else if (collection === 'draft') {
    noun = selectionCount > 1 ? localized('Drafts') : localized('Draft');
  }
  return `${selectionCount} ${noun.toLocaleLowerCase()} ${localized(`selected`)}`;
}

const MultiselectToolbar: React.FC<MultiselectToolbarProps> = React.memo(
  ({ toolbarElement, collection, onClearSelection, selectionCount }) => (
    <CSSTransitionGroup
      className={'selection-bar'}
      transitionName="selection-bar-absolute"
      component="div"
      transitionLeaveTimeout={200}
      transitionEnterTimeout={200}
    >
      {selectionCount > 0 ? (
        <div className="absolute" key="absolute">
          <div className="inner">
            {toolbarElement}
            <div className="centered">{selectionLabel(selectionCount, collection)}</div>
            <button style={{ order: 100 }} className="btn btn-toolbar" onClick={onClearSelection}>
              {localized('Clear Selection')}
            </button>
          </div>
        </div>
      ) : undefined}
    </CSSTransitionGroup>
  ),
  (prev, next) => Utils.isEqualReact(prev, next)
);
MultiselectToolbar.displayName = 'MultiselectToolbar';

export default MultiselectToolbar;
