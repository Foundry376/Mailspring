import { React, PropTypes, Utils, ComponentRegistry } from 'mailspring-exports';

import Flexbox from './flexbox';
import InjectedComponentErrorBoundary from './injected-component-error-boundary';
import InjectedComponentLabel from './injected-component-label';

type InjectedComponentSetProps = {
  matching: object,
  className?: string,
  matchLimit?: number,
  exposedProps?: object,
  containersRequired?: boolean,
  deferred?: boolean
};
type InjectedComponentSetState = {
  components: any,
  visible: any
};

/**
Public: InjectedComponent makes it easy to include a set of dynamically registered
components inside of your React render method. Rather than explicitly render
an array of buttons, for example, you can use InjectedComponentSet:

```jsx
  <InjectedComponentSet
    className="message-actions"
    matching={{role: 'ThreadActionButton'}}
    exposedProps={{thread:this.props.thread, message:this.props.message}}
  />
```

InjectedComponentSet will look up components registered for the location you provide,
render them inside a {Flexbox} and pass them `exposedProps`. By default, all injected
children are rendered inside error boundary wrappers to prevent third-party code
from throwing exceptions that break React renders.

InjectedComponentSet monitors the ComponentRegistry for changes. If a new component
is registered into the location you provide, InjectedComponentSet will re-render.

If no matching components is found, the InjectedComponent renders an empty span.

Section: Component Kit
 */
export default class InjectedComponentSet extends React.Component<InjectedComponentSetProps, InjectedComponentSetState> {
  static displayName = 'InjectedComponentSet';

  /*
  Public: React `props` supported by InjectedComponentSet:

   - `matching` Pass an {Object} with ComponentRegistry descriptors
      This set of descriptors is provided to {ComponentRegistry::findComponentsForDescriptor}
      to retrieve components for display.
   - `matchLimit` (optional) A {Number} that indicates the max number of matching elements to render
   - `className` (optional) A {String} class name for the containing element.
   - `children` (optional) Any React elements rendered inside the InjectedComponentSet
      will always be displayed.
   - `exposedProps` (optional) An {Object} with props that will be passed to each
      item rendered into the set.
   - `containersRequired` (optional). Pass false to optionally remove the containers
      placed around injected components to isolate them from the rest of the app.
   - `deferred` (optiona). Pass true to render an empty space and fill in the injected
      components after a few milliseconds. Useful for avoiding potential slowdowns in
      getting core (composer) components onscreen.
   -  Any other props you provide, such as `direction`, `data-column`, etc.
      will be applied to the {Flexbox} rendered by the InjectedComponentSet.
  */
  static propTypes = {
    matching: PropTypes.object.isRequired,
    children: PropTypes.array,
    className: PropTypes.string,
    matchLimit: PropTypes.number,
    exposedProps: PropTypes.object,
    containersRequired: PropTypes.bool,
    deferred: PropTypes.bool,
  };

  static defaultProps = {
    direction: 'row',
    className: '',
    exposedProps: {},
    containersRequired: true,
  };

  constructor(props, context) {
    super(props, context);
    this.state = !props.deferred ? this._getStateFromStores() : { components: [], visible: false };
  }

  componentDidMount() {
    this._mounted = true;

    if (!this.props.deferred) {
      this.listen();
    } else {
      setTimeout(() => {
        this.setState(this._getStateFromStores());
        this.listen();
      }, 400);
    }
  }

  listen() {
    this._componentUnlistener = ComponentRegistry.listen(() =>
      this.setState(this._getStateFromStores())
    );
  }

  componentWillReceiveProps(newProps) {
    if (!this.props || !Utils.isEqualReact(newProps.matching, this.props.matching)) {
      this.setState(this._getStateFromStores(newProps));
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._componentUnlistener) {
      this._componentUnlistener();
    }
  }

  _getStateFromStores = (props = this.props) => {
    return {
      components: ComponentRegistry.findComponentsMatching(props.matching).slice(
        0,
        props.matchLimit
      ),
      visible: ComponentRegistry.showComponentRegions(),
    };
  };

  render() {
    const { components, visible } = this.state;
    const { exposedProps, containersRequired, matching, children } = this.props;
    let { className } = this.props;

    const flexboxProps = Utils.fastOmit(this.props, Object.keys(this.constructor.propTypes));

    const elements = components.map(Component => {
      if (containersRequired === false || Component.containerRequired === false) {
        return <Component key={Component.displayName} {...exposedProps} />;
      }
      return (
        <InjectedComponentErrorBoundary key={Component.displayName}>
          <Component {...exposedProps} />
        </InjectedComponentErrorBoundary>
      );
    });

    if (visible) {
      className += ' injected-region-visible';
      elements.unshift(
        <InjectedComponentLabel key="_label" matching={matching} {...exposedProps} />
      );
      elements.push(<span key="_clear" style={{ clear: 'both' }} />);
    }

    if (this.props.deferred) {
      className += ' display-deferrable';
      if (!components.length) {
        className += ' deferred';
      }
    }

    return (
      <Flexbox className={className} {...flexboxProps}>
        {elements}
        {children}
      </Flexbox>
    );
  }
}
