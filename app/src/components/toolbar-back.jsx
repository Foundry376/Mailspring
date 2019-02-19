import React from 'react';
import PropTypes from 'prop-types';
import { Actions, } from 'mailspring-exports';

import RetinaImg from './retina-img';
let Category = null;
let FocusedPerspectiveStore = null;
export default class ToolbarBack extends React.Component {
  static displayName = 'ToolbarBack';

  // These stores are only required when this Toolbar is actually needed.
  // This is because loading these stores has database side effects.
  constructor(props) {
    super(props);
    Category = Category || require('../flux/models/category').default;
    FocusedPerspectiveStore =
      FocusedPerspectiveStore || require('../flux/stores/focused-perspective-store').default;
    this.state = {
      categoryName: FocusedPerspectiveStore.current().name,
    };
  }

  componentDidMount() {
    this._unsubscriber = FocusedPerspectiveStore.listen(() =>
      this.setState({ categoryName: FocusedPerspectiveStore.current().name })
    );
  }

  componentWillUnmount() {
    if (this._unsubscriber) {
      this._unsubscriber();
    }
  }

  _onClick = () => {
    Actions.popSheet();
  };

  render() {
    let title = 'Back';
    if (this.state.categoryName === Category.AllMailName) {
      title = 'All Mail';
    } else if (this.state.categoryName === 'INBOX') {
      title = 'Inbox';
    } else {
      title = this.state.categoryName;
    }
    return (
      <div className="item-back" onClick={this._onClick} title={`Return to ${title}`}>
        <RetinaImg name={'arrow.svg'} style={{ width: 24, height: 24 }} isIcon mode={RetinaImg.Mode.ContentIsMask} />
      </div>
    );
  }
}