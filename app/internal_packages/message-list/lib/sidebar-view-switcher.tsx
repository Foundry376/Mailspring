import React from 'react';
import { PropTypes, FocusedContactsStore, Contact } from 'mailspring-exports';
import { InjectedComponentSet } from 'mailspring-component-kit';
import { SidebarViewToggle, SidebarView } from './sidebar-view-toggle';
import { SidebarParticipantPicker } from './sidebar-participant-picker';
import { SidebarCalendarDayView } from './sidebar-calendar-day-view';

class FocusedContactStorePropsContainer extends React.Component<
  { children: React.ReactElement<any> },
  { sortedContacts: Contact[]; focusedContact: Contact }
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

const SidebarPluginContainerInner = (props) => {
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

export class SidebarViewSwitcher extends React.Component<{}, { selectedView: SidebarView }> {
  static displayName = 'SidebarViewSwitcher';

  static containerStyles = {
    order: 0,
    flexShrink: 0,
    minWidth: 150,
    maxWidth: 300,
  };

  constructor(props: {}) {
    super(props);
    this.state = {
      selectedView: 'contacts',
    };
  }

  _onSelectView = (view: SidebarView) => {
    this.setState({ selectedView: view });
  };

  render() {
    const { selectedView } = this.state;

    return (
      <div className="sidebar-view-switcher">
        <SidebarViewToggle selectedView={selectedView} onSelectView={this._onSelectView} />
        {selectedView === 'contacts' ? (
          <div className="sidebar-contacts-view">
            <SidebarParticipantPicker />
            <FocusedContactStorePropsContainer>
              <SidebarPluginContainerInner />
            </FocusedContactStorePropsContainer>
          </div>
        ) : (
          <SidebarCalendarDayView />
        )}
      </div>
    );
  }
}
