import { CategoryStore, React, Actions, ChangeRoleMappingTask } from 'mailspring-exports';
import PropTypes from 'prop-types';
import CategorySelection from './category-selection';

const SELECTABLE_ROLES = ['inbox', 'sent', 'drafts', 'spam', 'archive', 'trash'];

export default class PreferencesCategory extends React.Component {
  static propTypes = {
    account: PropTypes.object,
  };
  constructor(props) {
    super(props);
    const states = this._getStateFromStores(props.account);
    states.old_assignments = states.assignments;
    this.state = states;
  }

  componentDidMount() {
    this._unlisten = CategoryStore.listen(() => {
      const states = this._getStateFromStores(this.props.account);
      states.old_assignments = states.assignments;
      this.setState(states);
    });
  }

  componentWillUnmount() {
    if (this._unlisten) {
      this._unlisten();
    }
  }

  _getStateFromStores(account) {
    const assignments = {};
    const all = CategoryStore.categories(account);
    all.forEach(cat => {
      if (SELECTABLE_ROLES.includes(cat.role)) {
        assignments[cat.role] = cat;
      }
    });
    return { assignments, all };
  }

  _onCategorySelection = async (account, role, category) => {
    // our state will be updated as soon as the sync worker commits the change
    Actions.queueTask(
      new ChangeRoleMappingTask({
        role: role,
        path: category.path,
        accountId: account.id,
      })
    );
  };

  _renderRoleSection = role => {
    const { account } = this.props;
    if (account.provider === 'gmail' && role === 'archive') {
      return false;
    }
    const old = this.state.old_assignments ? this.state.old_assignments[role] : false;
    return (
      <div className={'role-section ' + role} key={`${account.id}-${role}`}>
        <div className="col-left">{`${role[0].toUpperCase()}${role.substr(1)}`}:</div>
        <div className="col-right">
          <CategorySelection
            all={this.state.all}
            current={this.state.assignments ? this.state.assignments[role] : null}
            onSelect={category => this._onCategorySelection(account, role, category)}
            accountUsesLabels={account.usesLabels()}
            disabled={!!old}
          />
        </div>
      </div>
    );
  };

  render() {
    return (
      <div className="category-mapper-container">
        <div>{SELECTABLE_ROLES.map(role => this._renderRoleSection(role))}</div>
      </div>
    );
  }
}
