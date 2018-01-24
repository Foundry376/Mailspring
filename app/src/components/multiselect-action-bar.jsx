const CSSTransitionGroup = require('react-transition-group/CSSTransitionGroup');
const _ = require('underscore');

const { React, PropTypes, Utils } = require('mailspring-exports');
const InjectedComponentSet = require('./injected-component-set').default;

/*
Public: MultiselectActionBar is a simple component that can be placed in a {Sheet} Toolbar.
When the provided `dataStore` has a selection, it appears over the other items in the toolbar.

Generally, you wrap {MultiselectActionBar} in your own simple component to provide a dataStore
and other settings:

```javascript
class MultiselectActionBar extends React.Component {
  render() {
    return (
      <MultiselectActionBar
        dataStore={ThreadListStore}
        className="thread-list"
        collection="thread" />
    )
  }
}
```

The MultiselectActionBar uses the `ComponentRegistry` to find items to display for the given
collection name. To add an item to the bar created in the example above, register it like this:

```javascript
ComponentRegistry.register(ThreadBulkTrashButton, {
  role: 'ThreadActionsToolbarButton'
});
```

Section: Component Kit
*/
class MultiselectActionBar extends React.Component {
  static displayName = 'MultiselectActionBar';

  /*
    Public: React `props` supported by MultiselectActionBar:
  
     - `dataStore` An instance of a {ListDataSource}.
     - `collection` The name of the collection. The collection name is used for the text
        that appears in the bar "1 thread selected" and is also used to find components
        in the component registry that should appear in the bar (`thread` => `thread:BulkAtion`)
    */
  static propTypes = {
    collection: PropTypes.string.isRequired,
    dataSource: PropTypes.object,
  };

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this.setupForProps(this.props);
  }

  componentWillReceiveProps(newProps) {
    if (_.isEqual(this.props, newProps)) {
      return;
    }
    this.teardownForProps();
    this.setupForProps(newProps);
    this.setState(this._getStateFromStores(newProps));
  }

  componentWillUnmount() {
    this.teardownForProps();
  }

  teardownForProps() {
    if (!this._unsubscribers) {
      return;
    }
    this._unsubscribers.map(unsubscribe => unsubscribe());
  }

  setupForProps(props) {
    this._unsubscribers = [];
    this._unsubscribers.push(props.dataSource.listen(this._onChange));
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  render() {
    return (
      <CSSTransitionGroup
        className={'selection-bar'}
        transitionName="selection-bar-absolute"
        component="div"
        transitionLeaveTimeout={200}
        transitionEnterTimeout={200}
      >
        {this.state.items.length > 0 ? this._renderBar() : []}
      </CSSTransitionGroup>
    );
  }

  _renderBar() {
    return (
      <div className="absolute" key="absolute">
        <div className="inner">
          {this._renderActions()}

          <div className="centered">{this._label()}</div>

          <button
            style={{ order: 100 }}
            className="btn btn-toolbar"
            onClick={this._onClearSelection}
          >
            Clear Selection
          </button>
        </div>
      </div>
    );
  }

  _renderActions() {
    if (!this.props.dataSource) {
      return <div />;
    }
    return (
      <InjectedComponentSet
        matching={{ role: `${this.props.collection}:Toolbar` }}
        exposedProps={{ selection: this.props.dataSource.selection, items: this.state.items }}
      />
    );
  }

  _label() {
    if (this.state.items.length > 1) {
      return `${this.state.items.length} ${this.props.collection}s selected`;
    } else if (this.state.items.length === 1) {
      return `${this.state.items.length} ${this.props.collection} selected`;
    } else {
      return '';
    }
  }

  _getStateFromStores(props) {
    let left;
    if (props == null) {
      ({ props } = this);
    }
    return { items: (left = props.dataSource.selection.items()) != null ? left : [] };
  }

  _onChange = () => {
    this.setState(this._getStateFromStores());
  };

  _onClearSelection = () => {
    this.props.dataSource.selection.clear();
  };
}

module.exports = MultiselectActionBar;
