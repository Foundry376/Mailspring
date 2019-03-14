import { React, WorkspaceStore } from 'mailspring-exports';
import ThreadSearchBar from '../../thread-search/lib/thread-search-bar';

import { InjectedComponent } from 'mailspring-component-kit';


export default class QuickSidebar extends React.Component {
  static displayName = 'QuickSidebar';
  constructor(props) {
    super(props);
    this.state = {};
  }
  render() {
    return (
      <div className="sidebar-quick">
        <InjectedComponent
          matching={{ location: WorkspaceStore.Sheet.Thread.QuickToolbar.Top }}
        />
      </div>
    );
  }
}
