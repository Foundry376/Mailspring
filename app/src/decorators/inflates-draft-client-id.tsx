import React from 'react';
import PropTypes from 'prop-types';
import DraftStore from '../flux/stores/draft-store';
import * as Actions from '../flux/actions';
import * as Utils from '../flux/models/utils';
import { Message, DraftEditingSession } from 'mailspring-exports';

function InflatesDraftClientId(
  ComposedComponent
): React.ComponentType<
  { headerMessageId: string; onDraftReady: () => void } & React.HTMLProps<HTMLElement>
> {
  return class extends React.Component<
    { headerMessageId: string; onDraftReady: () => void } & React.HTMLProps<HTMLElement>,
    { draft: Message; session: DraftEditingSession; _lastHeaderMessageId: string }
  > {
    static displayName = ComposedComponent.displayName;

    static propTypes = {
      headerMessageId: PropTypes.string,
      onDraftReady: PropTypes.func,
    };

    static defaultProps = {
      onDraftReady: () => {},
    };

    static containerRequired = false;

    static getDerivedStateFromProps(
      props: { headerMessageId: string; onDraftReady: () => void },
      state: { draft: Message; session: DraftEditingSession; _lastHeaderMessageId: string }
    ) {
      // If headerMessageId prop has changed, clear draft and session state
      // to prevent rendering with mismatched data
      if (props.headerMessageId !== state._lastHeaderMessageId) {
        return {
          draft: null,
          session: null,
          _lastHeaderMessageId: props.headerMessageId,
        };
      }
      return null;
    }

    _mounted = false;
    _sessionUnlisten?: () => void;

    constructor(props) {
      super(props);
      this.state = {
        session: null,
        draft: null,
        _lastHeaderMessageId: props.headerMessageId,
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

    componentDidUpdate(prevProps: { headerMessageId: string; onDraftReady: () => void }) {
      if (prevProps.headerMessageId !== this.props.headerMessageId) {
        // getDerivedStateFromProps has already cleared draft/session state before render
        // Now we just need to teardown the old draft and prepare for the new one
        this._teardownForDraft();
        this._prepareForDraft(this.props.headerMessageId);
      }
    }

    async _prepareForDraft(headerMessageId) {
      if (!headerMessageId) {
        return;
      }
      const session = await DraftStore.sessionForClientId(headerMessageId);
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

    // Returns a promise for use in composer/main.ts, to show the window
    // once the composer is rendered and focused.
    focus() {
      return Utils.waitFor(() => this.refs.composed)
        .then(() => (this.refs.composed as any).focus())
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
