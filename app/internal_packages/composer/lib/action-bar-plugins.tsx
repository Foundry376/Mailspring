import classnames from 'classnames';
import React from 'react';
import { PropTypes, ComponentRegistry, Message, DraftEditingSession } from 'mailspring-exports';
import { InjectedComponentSet } from 'mailspring-component-kit';

const ROLE = 'Composer:ActionButton';

export default class ActionBarPlugins extends React.Component<
  {
    draft: Message;
    session: DraftEditingSession;
    isValidDraft: () => boolean;
  },
  { pluginsLoaded: boolean }
> {
  static displayName = 'ActionBarPlugins';

  static propTypes = {
    draft: PropTypes.object,
    session: PropTypes.object,
    isValidDraft: PropTypes.func,
  };

  _usub: () => void;

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this._usub = ComponentRegistry.listen(this._onComponentsChange);
  }

  componentWillUnmount() {
    this._usub();
  }

  _onComponentsChange = () => {
    if (this._getPluginsLength() > 0) {
      // The `InjectedComponentSet` also listens to the ComponentRegistry.
      // Since we can't guarantee the order the listeners are fired in and
      // we want to make sure we add the class after the injected component
      // set has rendered, put the call in this requestAnimationFrame
      //
      // It also takes 2 frames to reliably get all of the icons painted.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          this.setState(this._getStateFromStores());
        });
      });
    }
  };

  _getPluginsLength() {
    return ComponentRegistry.findComponentsMatching({ role: ROLE }).length;
  }

  _getStateFromStores() {
    return {
      pluginsLoaded: this._getPluginsLength() > 0,
    };
  }

  render() {
    const className = classnames({
      'action-bar-animation-wrap': true,
      'plugins-loaded': this.state.pluginsLoaded,
    });

    return (
      <span className={className}>
        <div className="action-bar-cover" />
        <InjectedComponentSet
          deferred
          className="composer-action-bar-plugins"
          matching={{ role: ROLE }}
          exposedProps={{
            draft: this.props.draft,
            threadId: this.props.draft.threadId,
            headerMessageId: this.props.draft.headerMessageId,
            session: this.props.session,
            isValidDraft: this.props.isValidDraft,
          }}
        />
      </span>
    );
  }
}
