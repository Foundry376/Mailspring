import React from 'react';
import PropTypes from 'prop-types';
import DraftStore from '../flux/stores/draft-store';
import Actions from '../flux/actions';
import Message from '../flux/models/message';
import Utils from '../flux/models/utils';

function InflatesDraftClientId(ComposedComponent) {
  return class extends React.Component {
    static displayName = `${ComposedComponent.displayName}-inflate`;

    static propTypes = {
      headerMessageId: PropTypes.string,
      messageId: PropTypes.string,
      onDraftReady: PropTypes.func,
    };

    static defaultProps = {
      onDraftReady: () => {
      },
    };

    static containerRequired = false;

    constructor(props) {
      super(props);
      this.state = {
        session: null,
        draft: null,
      };
      if (AppEnv.isMainWindow()) {
        this._windowLevel = 1;
      } else if (AppEnv.isComposerWindow()) {
        this._windowLevel = 3;
      } else {
        this._windowLevel = 2;
      }
      this._sessionUnlisten = null;
    }

    componentDidMount() {
      this._mounted = true;
      if (
        this.props.draft &&
        this.props.draft.savedOnRemote &&
        !Message.compareMessageState(this.props.draft.state, Message.messageState.sending) &&
        !Message.compareMessageState(this.props.draft.state, Message.messageState.failing)
      ) {
        this._prepareServerDraftForEdit(this.props.draft);
      } else {
        if (
          this.props.draft &&
          (Message.compareMessageState(this.props.draft.state, Message.messageState.sending) ||
          Message.compareMessageState(this.props.draft.state, Message.messageState.failing))
        ) {
          AppEnv.reportError(
            new Error('Draft editing session should not have sending/failing state drafts'),
            { errorData: this.props.draft }
          );
        } else {
          this._prepareForDraft(this.props.headerMessageId, this.props.messageId);
        }
      }
    }

    componentWillUnmount() {
      this._mounted = false;
      this._teardownForDraft();
      // this._deleteDraftIfEmpty();
    }

    componentWillReceiveProps(newProps) {
      if (
        newProps.headerMessageId !== this.props.headerMessageId ||
        newProps.messageId !== this.props.messageId
      ) {
        // console.log(`new props: ${JSON.stringify(newProps)}`);
        this._teardownForDraft();
        if (
          newProps.draft &&
          newProps.draft.savedOnRemote &&
          !Message.compareMessageState(newProps.draft.state, Message.messageState.sending) &&
          !Message.compareMessageState(newProps.draft.state, Message.messageState.failing)) {
          this._prepareServerDraftForEdit(newProps.draft);
        } else {
          this._prepareForDraft(newProps.headerMessageId, newProps.messageId);
        }
      }
    }

    _onDraftGotNewId = (event, options) => {
      if (
        options.referenceMessageId &&
        options.newHeaderMessageId &&
        options.newMessageId &&
        options.referenceMessageId === this.state.messageId
      ) {
        this.setState({
          headerMessageId: options.newHeaderMessageId,
          messageId: options.newMessageId,
        });
      }
    };

    _prepareServerDraftForEdit(draft) {
      if (draft.savedOnRemote) {
        DraftStore.sessionForServerDraft(draft).then(session => {
          const shouldSetState = () => {
            if (!session) {
              AppEnv.reportError(new Error('session not available'));
              return this._mounted;
            }
            const newDraft = session.draft();
            let sameDraftWithNewID = false; // account for when draft gets new id because of being from remote
            if (newDraft && newDraft.refOldDraftHeaderMessageId) {
              sameDraftWithNewID = newDraft.refOldDraftHeaderMessageId === this.props.headerMessageId;
            }
            return (
              this._mounted &&
              (newDraft.refOldDraftHeaderMessageId === this.props.headerMessageId || sameDraftWithNewID)
            );
          };
          this._sessionUnlisten = session.listen(() => {
            // console.log('inflates, data change');
            if (!shouldSetState()) {
              // console.log('-------------------inflate-draft-cilent-id--------------- ');
              // console.log('did not update state')
              // console.log('------------------------------------- ');
              return;
            }
            if(this._mounted){
              this.setState({ draft: session.draft() });
            }
          });
          if(this._mounted){
            this.setState({
              session: session,
              draft: session.draft(),
            });
            this.props.onDraftReady();
          }
        });
      }
    }

    _prepareForDraft(headerMessageId, messageId) {
      if (!headerMessageId && !messageId) {
        return;
      }
      DraftStore.sessionForClientId(headerMessageId).then(session => {
        const shouldSetState = () => {
          if (!session) {
            AppEnv.reportError(new Error('session not available'));
            return this._mounted;
          }
          const draft = session.draft();
          let sameDraftWithNewID = false; // account for when draft gets new id because of being from remote
          if (draft && draft.referenceMessageId) {
            sameDraftWithNewID = draft.referenceMessageId === messageId;
          }
          return (
            this._mounted &&
            (session.headerMessageId === this.props.headerMessageId || sameDraftWithNewID)
          );
        };
        if (!shouldSetState()) {
          // console.log('-------------------inflate-draft-cilent-id--------------- ');
          // console.log('did not update state')
          // console.log('------------------------------------- ');
          return;
        }
        // if (this._sessionUnlisten) {
        //   this._sessionUnlisten();
        // }
        this._sessionUnlisten = session.listen(() => {
          // console.log('inflates, data change');
          if (!shouldSetState()) {
            // console.log('-------------------inflate-draft-cilent-id--------------- ');
            // console.log('did not update state')
            // console.log('------------------------------------- ');
            return;
          }
          if(this._mounted){
            this.setState({ draft: session.draft() });
          }else {
            console.error(`component unmounted, session draft ${session.draft()}`);
          }
        });
        if(this._mounted){
          this.setState({
            session: session,
            draft: session.draft(),
          });
          this.props.onDraftReady();
        } else {
          console.error(`component unmounted, session draft ${session.draft()}`);
        }
      });
    }

    _teardownForDraft() {
      if (this._sessionUnlisten) {
        this._sessionUnlisten();
      }
      if (this.state.draft) {
        Actions.draftWindowClosing({
          headerMessageIds: [this.state.draft.headerMessageId],
          windowLevel: this._windowLevel,
          source: 'componentWillUnmount',
        });
      }
    }

    _deleteDraftIfEmpty() {
      if (!this.state.draft) {
        return;
      }
      if (this.state.draft.pristine && !this.state.draft.remoteUID) {
        //making sure draft is not from remote
        Actions.destroyDraft([this.state.draft], { canBeUndone: false });
      }
    }

    // Returns a promise for use in composer/main.es6, to show the window
    // once the composer is rendered and focused.
    focus() {
      return Utils.waitFor(() => this.refs.composed)
        .then(() => this.refs.composed.focus())
        .catch(() => {
        });
    }

    render() {
      if (!this.state.draft) {
        return <span/>;
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
