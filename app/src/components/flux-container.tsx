import React from 'react';
import { PropTypes, Utils } from 'mailspring-exports';

type FluxContainerProps = {
  stores: any[];
  getStateFromStores: (...args: any[]) => object;
  children: React.ReactElement<any>;
};

class FluxContainer extends React.Component<FluxContainerProps & React.HTMLProps<HTMLDivElement>> {
  static displayName = 'FluxContainer';
  static propTypes = {
    children: PropTypes.element,
    stores: PropTypes.array.isRequired,
    getStateFromStores: PropTypes.func.isRequired,
  };

  _unlisteners = [];

  constructor(props) {
    super(props);
    this.state = this.props.getStateFromStores();
  }

  componentDidMount() {
    return this.setupListeners();
  }

  componentWillReceiveProps(nextProps) {
    this.setState(nextProps.getStateFromStores());
    return this.setupListeners(nextProps);
  }

  componentWillUnmount() {
    for (const unlisten of this._unlisteners) {
      unlisten();
    }
    this._unlisteners = [];
  }

  setupListeners(props = this.props) {
    for (const unlisten of this._unlisteners) {
      unlisten();
    }

    this._unlisteners = props.stores.map(store => {
      return store.listen(() => this.setState(props.getStateFromStores()));
    });
  }

  render() {
    const otherProps = Utils.fastOmit(this.props, Object.keys(FluxContainer.propTypes));
    return React.cloneElement(this.props.children, Object.assign({}, otherProps, this.state));
  }
}

export default FluxContainer;
