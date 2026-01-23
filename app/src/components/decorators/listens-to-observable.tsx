import React, { CSSProperties } from 'react';

function ListensToObservable<T, U, V>(
  ComposedComponent: typeof React.Component & {
    displayName?: string;
    containerRequired?: boolean;
    containerStyles?: CSSProperties;
  },
  {
    getObservable,
    getStateFromObservable,
  }: {
    getObservable: (props: T) => Rx.Observable<U>;
    getStateFromObservable: (data: U, opts: { props: T }) => V;
  }
) {
  return class extends React.Component<T, V> {
    static displayName = ComposedComponent.displayName;
    static containerRequired = ComposedComponent.containerRequired;
    static containerStyles = ComposedComponent.containerStyles;

    disposable: any;
    unmounted: boolean;
    observable: Rx.Observable<U>;
    subscriptionId: number;

    constructor(props: T) {
      super(props);
      this.state = getStateFromObservable(null, { props });
      this.disposable = null;
      this.observable = getObservable(props);
      this.subscriptionId = 0;
    }

    componentDidMount() {
      this.unmounted = false;
      this.subscriptionId++;
      const currentSubscriptionId = this.subscriptionId;
      this.disposable = this.observable.subscribe(data =>
        this.onObservableChanged(data, currentSubscriptionId)
      );
    }

    componentDidUpdate(prevProps: T) {
      if (prevProps !== this.props) {
        if (this.disposable) {
          this.disposable.dispose();
        }
        this.subscriptionId++;
        const currentSubscriptionId = this.subscriptionId;
        this.observable = getObservable(this.props);
        this.disposable = this.observable.subscribe(data =>
          this.onObservableChanged(data, currentSubscriptionId)
        );
      }
    }

    componentWillUnmount() {
      this.unmounted = true;
      this.disposable.dispose();
    }

    onObservableChanged = (data: U, subscriptionId: number) => {
      if (this.unmounted) return;
      this.setState(getStateFromObservable(data, { props: this.props }));
    };

    render() {
      return <ComposedComponent {...(this.state as any)} {...this.props} />;
    }
  };
}

export default ListensToObservable;
