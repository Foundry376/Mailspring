import React from 'react';

/**
This used to be very complex. With React 16, we just use Error Boundaries!
https://reactjs.org/blog/2017/07/26/error-handling-in-react-16.html

Section: Component Kit
*/
export default class InjectedComponentErrorBoundary extends React.Component<
  {},
  { error: string | null }
> {
  static displayName = 'InjectedComponentErrorBoundary';

  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error, info) {
    this.setState({ error: error.stack });
    AppEnv.reportError(error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="unsafe-component-exception">
          <div className="trace">{this.state.error}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
