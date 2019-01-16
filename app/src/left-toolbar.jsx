import React from 'react';
import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

export default class LeftToolbar extends React.Component {
  static displayName = 'LeftToolbar';

  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    const loc = this.props.loc,
      mode = WorkspaceStore.layoutMode();
    const style = {
      position: 'relative',
      backgroundColor: 'lightgray',
      padding: '0 0 0 20px',
      zIndex: 999,
    };
    const components = ComponentRegistry.findComponentsMatching({
      location: loc.Toolbar,
      mode,
    });

    return (
      <div
        style={style}
        className={`left-toolbar-container`}
      >
        {
          components.map(Component => (
            <Component key={Component.displayName}/>
          ))
        }
      </div>
    );
  }
}
