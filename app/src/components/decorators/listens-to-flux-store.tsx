/* eslint no-prototype-builtins: 0 */
import React, { Component } from 'react';

function ListensToFluxStore(ComposedComponent, { stores, getStateFromStores }) {
  return class extends Component {
    static displayName = ComposedComponent.displayName;

    static containerRequired = false;

    static propTypes = ComposedComponent.propTypes;

    _unlisteners = [];
    _composedComponent: any;

    constructor(props) {
      super(props);
      this.state = getStateFromStores(props);
    }

    componentDidMount() {
      stores.forEach(store => {
        this._unlisteners.push(
          store.listen(() => {
            this.setState(getStateFromStores(this.props));
          })
        );
      });
    }

    componentWillReceiveProps(nextProps) {
      this.setState(getStateFromStores(nextProps));
    }

    componentWillUnmount() {
      for (const unlisten of this._unlisteners) {
        unlisten();
      }
      this._unlisteners = [];
    }

    render() {
      const props: any = {
        ...this.props,
        ...this.state,
      };
      if (Component.isPrototypeOf(ComposedComponent)) {
        props.ref = cm => {
          this._composedComponent = cm;
        };
      }
      return <ComposedComponent {...props} />;
    }
  } as any;
}

export default ListensToFluxStore;
