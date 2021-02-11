import React from 'react';
import { PropTypes, FocusedContactsStore, Contact } from 'mailspring-exports';
import { InjectedComponentSet } from 'mailspring-component-kit';

class FocusedContactStorePropsContainer extends React.Component<
  { children: React.ReactElement<any> },
  { focusedContact: Contact }
> {
  static displayName = 'FocusedContactStorePropsContainer';

  unsubscribe: () => void;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.unsubscribe = FocusedContactsStore.listen(this._onChange);
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  _onChange = () => {
    this.setState(this._getStateFromStores());
  };

  _getStateFromStores() {
    return {
      sortedContacts: FocusedContactsStore.sortedContacts(),
      focusedContact: FocusedContactsStore.focusedContact(),
    };
  }

  render() {
    let classname = 'sidebar-section';
    let inner = null;
    if (this.state.focusedContact) {
      classname += ' visible';
      inner = React.cloneElement(this.props.children, this.state);
    }
    return <div className={classname}>{inner}</div>;
  }
}

const SidebarPluginContainerInner = props => {
  return (
    <InjectedComponentSet
      className="sidebar-contact-card"
      key={props.focusedContact.email}
      matching={{ role: 'MessageListSidebar:ContactCard' }}
      direction="column"
      exposedProps={{
        contact: props.focusedContact,
      }}
    />
  );
};

SidebarPluginContainerInner.propTypes = {
  focusedContact: PropTypes.object,
};

export class SidebarPluginContainer extends React.Component {
  static displayName = 'SidebarPluginContainer';

  static containerStyles = {
    order: 1,
    flexShrink: 0,
    minWidth: 150,
    maxWidth: 300,
  };

  render() {
    return (
      <FocusedContactStorePropsContainer>
        <SidebarPluginContainerInner />
      </FocusedContactStorePropsContainer>
    );
  }
}
