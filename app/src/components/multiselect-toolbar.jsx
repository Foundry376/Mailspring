import { Utils, localized } from 'mailspring-exports';
import React, { Component } from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import PropTypes from 'prop-types';

/*
 * MultiselectToolbar renders a toolbar inside a horizontal bar and displays
 * a selection count and a button to clear the selection.
 *
 * The toolbar, or set of buttons, must be passed in as props.toolbarElement
 *
 * It will also animate its mounting and unmounting
 * @class MultiselectToolbar
 */
class MultiselectToolbar extends Component {
  static displayName = 'MultiselectToolbar';

  static propTypes = {
    toolbarElement: PropTypes.element.isRequired,
    collection: PropTypes.string.isRequired,
    onClearSelection: PropTypes.func.isRequired,
    selectionCount: PropTypes.node,
  };

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  selectionLabel = () => {
    const { selectionCount, collection } = this.props;
    if (selectionCount === 0) {
      return '';
    }

    let noun = '';
    if (collection === 'thread') {
      noun = selectionCount > 1 ? localized('threads') : localized('thread');
    } else if (collection === 'draft') {
      noun = selectionCount > 1 ? localized('drafts') : localized('draft');
    }

    return localized(`%@ %@ selected`, selectionCount, noun);
  };

  renderToolbar() {
    const { toolbarElement, onClearSelection } = this.props;
    return (
      <div className="absolute" key="absolute">
        <div className="inner">
          {toolbarElement}
          <div className="centered">{this.selectionLabel()}</div>

          <button style={{ order: 100 }} className="btn btn-toolbar" onClick={onClearSelection}>
            {localized('Clear Selection')}
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { selectionCount } = this.props;
    return (
      <CSSTransitionGroup
        className={'selection-bar'}
        transitionName="selection-bar-absolute"
        component="div"
        transitionLeaveTimeout={200}
        transitionEnterTimeout={200}
      >
        {selectionCount > 0 ? this.renderToolbar() : undefined}
      </CSSTransitionGroup>
    );
  }
}

export default MultiselectToolbar;
