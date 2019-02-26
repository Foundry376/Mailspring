import React from 'react';
import PropTypes from 'prop-types';
import DraftStore from '../flux/stores/draft-store';
import Actions from '../flux/actions';
import Utils from '../flux/models/utils';

function InflatesDraftClientId(ComposedComponent) {
  return class extends React.Component {
    static displayName = ComposedComponent.displayName;

    static propTypes = {
      headerMessageId: PropTypes.string,
      onDraftReady: PropTypes.func,
    };

    static defaultProps = {
      onDraftReady: () => {},
    };

    static containerRequired = false;

    constructor(props) {
      super(props);
      this.state = {
        session: null,
        draft: null,
      };
    }

    componentDidMount() {
      this._mounted = true;
      this._prepareForDraft(this.props.headerMessageId);
    }

    componentWillUnmount() {
      this._mounted = false;
      this._teardownForDraft();
      this._deleteDraftIfEmpty();
    }

    componentWillReceiveProps(newProps) {
      if (newProps.headerMessageId !== this.props.headerMessageId) {
        this._teardownForDraft();
        this._prepareForDraft(newProps.headerMessageId);
      }
    }

    _prepareForDraft(headerMessageId) {
      if (!headerMessageId) {
        return;
      }
      DraftStore.sessionForClientId(headerMessageId).then(session => {
        const shouldSetState = () =>
          this._mounted && session.headerMessageId === this.props.headerMessageId;

        if (!shouldSetState()) {
          return;
        }
        this._sessionUnlisten = session.listen(() => {
          if (!shouldSetState()) {
            return;
          }
          this.setState({ draft: session.draft() });
        });

        this.setState({
          session: session,
          draft: session.draft(),
        });
        this.props.onDraftReady();
      });
    }

    _teardownForDraft() {
      if (this.state.session) {
        this.state.session.changes.commit();
      }
      if (this._sessionUnlisten) {
        this._sessionUnlisten();
      }
    }

    _deleteDraftIfEmpty() {
      if (!this.state.draft) {
        return;
      }
      if (this.state.draft.pristine) {
        Actions.destroyDraft(this.state.draft);
      }
    }

    // Returns a promise for use in composer/main.es6, to show the window
    // once the composer is rendered and focused.
    focus() {
      return Utils.waitFor(() => this.refs.composed)
        .then(() => this.refs.composed.focus())
        .catch(() => {});
    }

    render() {
      if (!this.state.draft) {
        return <span />;
      }
      return (
        <ComposedComponent
          key={this.state.draft.headerMessageId}
          ref="composed"
          {...this.props}
          {...this.state}
        />
      );
    }
  };
}

export default InflatesDraftClientId;
