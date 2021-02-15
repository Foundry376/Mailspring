import React from 'react';

function ListensToObservable<T, U, V>(
  ComposedComponent: typeof React.Component & {
    displayName?: string;
    containerRequired?: boolean;
    containerStyles?: object;
  },
  {
    getObservable,
    getStateFromObservable,
  }: {
    getObservable: (props: T) => Rx.Observable<U>;
    getStateFromObservable: (data: U, { props: T }) => V;
  }
) {
  return class extends ComposedComponent {
    static displayName = ComposedComponent.displayName;
    static containerRequired = ComposedComponent.containerRequired;
    static containerStyles = ComposedComponent.containerStyles;

    disposable: any;
    unmounted: boolean;
    observable: Rx.Observable<U>;

    constructor(props) {
      super(props);
      this.state = getStateFromObservable(null, { props });
      this.disposable = null;
      this.observable = getObservable(props);
    }

    componentDidMount() {
      this.unmounted = false;
      this.disposable = this.observable.subscribe(this.onObservableChanged);
    }

    componentWillReceiveProps(nextProps) {
      if (this.disposable) {
        this.disposable.dispose();
      }
      this.observable = getObservable(nextProps);
      this.disposable = this.observable.subscribe(this.onObservableChanged);
    }

    componentWillUnmount() {
      this.unmounted = true;
      this.disposable.dispose();
    }

    onObservableChanged = data => {
      if (this.unmounted) return;
      this.setState(getStateFromObservable(data, { props: this.props }));
    };

    render() {
      return <ComposedComponent {...this.state} {...this.props} />;
    }
  };
}

export default ListensToObservable;
