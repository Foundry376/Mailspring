import React from 'react';
import { PropTypes, Utils } from 'mailspring-exports';

type FluxContainerProps<T> = {
  stores: any[];
  getStateFromStores: (...args: any[]) => T;
  children: React.ReactElement<T>;
};

class FluxContainer<T> extends React.Component<
  FluxContainerProps<T> & React.HTMLProps<HTMLDivElement>
> {
  static displayName = 'FluxContainer';
  static propTypes = {
    children: PropTypes.element,
    stores: PropTypes.array.isRequired,
    getStateFromStores: PropTypes.func.isRequired,
  };

  _unlisteners = [];
  _getStateFromStores: (...args: any[]) => T;

  constructor(props) {
    super(props);
    this._getStateFromStores = props.getStateFromStores;
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    return this.setupListeners();
  }

  componentDidUpdate(prevProps: FluxContainerProps<T>) {
    if (
      prevProps.getStateFromStores !== this.props.getStateFromStores ||
      prevProps.stores !== this.props.stores
    ) {
      // Setup new listeners FIRST before setState to prevent race condition.
      // This ensures that if a store fires during/after setState, the new
      // listener (with new getStateFromStores) will be active, not the old one.
      this.setupListeners(this.props);
      this.setState(this._getStateFromStores());
    }
  }

  componentWillUnmount() {
    for (const unlisten of this._unlisteners) {
      unlisten();
    }
    this._unlisteners = [];
  }

  setupListeners(props = this.props) {
    // Update instance property to always reference the current getStateFromStores.
    // This prevents stale closures in listener callbacks.
    this._getStateFromStores = props.getStateFromStores;

    for (const unlisten of this._unlisteners) {
      unlisten();
    }

    // Listeners reference the instance property, not the captured props.
    // This ensures they always use the most current getStateFromStores function.
    this._unlisteners = props.stores.map(store => {
      return store.listen(() => this.setState(this._getStateFromStores()));
    });
  }

  render() {
    const otherProps = Utils.fastOmit(this.props, Object.keys(FluxContainer.propTypes));
    return React.cloneElement(this.props.children, Object.assign({}, otherProps, this.state));
  }
}

export default FluxContainer;
