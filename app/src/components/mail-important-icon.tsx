const _ = require('underscore');
const classNames = require('classnames');
const {
  localized,
  React,
  PropTypes,
  Actions,
  ChangeLabelsTask,
  CategoryStore,
  FocusedPerspectiveStore,
  AccountStore,
} = require('mailspring-exports');

const ShowImportantKey = 'core.workspace.showImportant';

class MailImportantIcon extends React.Component {
  static displayName = 'MailImportantIcon';
  static propTypes = {
    thread: PropTypes.object,
    showIfAvailableForAnyAccount: PropTypes.bool,
  };

  constructor(props) {
    super(props);
    this.state = this.getState();
  }

  getState = (props = this.props) => {
    let category = null;
    let visible = false;

    if (props.showIfAvailableForAnyAccount) {
      const perspective = FocusedPerspectiveStore.current();
      for (let accountId of perspective.accountIds) {
        const account = AccountStore.accountForId(accountId);
        const accountImportant = CategoryStore.getCategoryByRole(account, 'important');
        if (accountImportant) {
          visible = true;
        }
        if (accountId === props.thread.accountId) {
          category = accountImportant;
        }
        if (visible && category) {
          break;
        }
      }
    } else {
      category = CategoryStore.getCategoryByRole(props.thread.accountId, 'important');
      visible = category != null;
    }

    const isImportant = category && _.findWhere(props.thread.labels, { id: category.id }) != null;

    return { visible, category, isImportant };
  };

  componentDidMount() {
    this.unsubscribe = FocusedPerspectiveStore.listen(() => {
      this.setState(this.getState());
    });
    this.subscription = AppEnv.config.onDidChange(ShowImportantKey, () => {
      this.setState(this.getState());
    });
  }

  componentWillReceiveProps(nextProps) {
    this.setState(this.getState(nextProps));
  }

  componentWillUnmount() {
    if (typeof this.unsubscribe === 'function') {
      this.unsubscribe();
    }
    if (this.subscription) {
      this.subscription.dispose();
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !_.isEqual(nextState, this.state);
  }

  render() {
    let title;
    if (!this.state.visible) {
      return false;
    }

    const classes = classNames({
      'mail-important-icon': true,
      enabled: this.state.category != null,
      active: this.state.isImportant,
    });

    if (!this.state.category) {
      title = localized('No important folder / label');
    } else if (this.state.isImportant) {
      title = localized('Mark as Not Important');
    } else {
      title = localized('Mark as Important');
    }

    return <div className={classes} title={title} onClick={this._onToggleImportant} />;
  }

  _onToggleImportant = event => {
    const { category } = this.state;

    if (category) {
      const isImportant = _.findWhere(this.props.thread.labels, { id: category.id }) != null;

      if (!isImportant) {
        Actions.queueTask(
          new ChangeLabelsTask({
            labelsToAdd: [category],
            labelsToRemove: [],
            threads: [this.props.thread],
            source: 'Important Icon',
          })
        );
      } else {
        Actions.queueTask(
          new ChangeLabelsTask({
            labelsToAdd: [],
            labelsToRemove: [category],
            threads: [this.props.thread],
            source: 'Important Icon',
          })
        );
      }
    }

    // Don't trigger the thread row click
    event.stopPropagation();
  };
}

module.exports = MailImportantIcon;
