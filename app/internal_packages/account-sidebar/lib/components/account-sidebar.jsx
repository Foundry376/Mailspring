const React = require('react');
const { Utils, AccountStore } = require('mailspring-exports');
const { OutlineView, ScrollRegion, Flexbox } = require('mailspring-component-kit');
const AccountSwitcher = require('./account-switcher');
const SidebarStore = require('../sidebar-store');

class AccountSidebar extends React.Component {
  static displayName = 'AccountSidebar';

  static containerRequired = false;
  static containerStyles = {
    minWidth: 165,
    maxWidth: 250,
  };

  constructor(props) {
    super(props);

    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.unsubscribers = [];
    this.unsubscribers.push(SidebarStore.listen(this._onStoreChange));
    return this.unsubscribers.push(AccountStore.listen(this._onStoreChange));
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    return this.unsubscribers.map(unsubscribe => unsubscribe());
  }

  _onStoreChange = () => {
    return this.setState(this._getStateFromStores());
  };

  _getStateFromStores = () => {
    return {
      accounts: AccountStore.accounts(),
      sidebarAccountIds: SidebarStore.sidebarAccountIds(),
      userSections: SidebarStore.userSections(),
      standardSection: SidebarStore.standardSection(),
    };
  };

  _renderUserSections(sections) {
    return sections.map(section => <OutlineView key={section.title} {...section} />);
  }

  render() {
    const { accounts, sidebarAccountIds, userSections, standardSection } = this.state;

    return (
      <Flexbox direction="column" style={{ order: 0, flexShrink: 1, flex: 1 }}>
        <ScrollRegion className="account-sidebar" style={{ order: 2 }}>
          <AccountSwitcher accounts={accounts} sidebarAccountIds={sidebarAccountIds} />
          <div className="account-sidebar-sections">
            <OutlineView {...standardSection} />
            {this._renderUserSections(userSections)}
          </div>
        </ScrollRegion>
      </Flexbox>
    );
  }
}

module.exports = AccountSidebar;
