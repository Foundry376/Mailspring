import { remote } from 'electron';
import React from 'react';
import ReactDOM from 'react-dom';
import {
  localized,
  PropTypes,
  Utils,
  Actions,
  DraftStore,
  DraftEditingSession,
  MessageWithEditorState,
} from 'mailspring-exports';
import {
  DropZone,
  RetinaImg,
  ScrollRegion,
  TabGroupRegion,
  KeyCommandsRegion,
  InjectedComponentSet,
  ComposerEditor,
  ComposerSupport,
} from 'mailspring-component-kit';
import { ComposerHeader } from './composer-header';
import { SendActionButton } from './send-action-button';
import { ActionBarPlugins } from './action-bar-plugins';
import { AttachmentsArea } from './attachments-area';
import { QuotedTextControl } from './quoted-text-control';
import Fields from './fields';

const {
  hasBlockquote,
  hasNonTrailingBlockquote,
  hideQuotedTextByDefault,
} = ComposerSupport.BaseBlockPlugins;

interface ComposerViewProps {
  draft: MessageWithEditorState;
  session: DraftEditingSession;
  className?: string;
}
interface ComposerViewState {
  quotedTextHidden: boolean;
  quotedTextPresent: boolean;
  isDropping: boolean;
}
// The ComposerView is a unique React component because it (currently) is a
// singleton. Normally, the React way to do things would be to re-render the
// Composer with new props.
export default class ComposerView extends React.Component<ComposerViewProps, ComposerViewState> {
  static displayName = 'ComposerView';

  static propTypes = {
    session: PropTypes.object.isRequired,
    draft: PropTypes.object.isRequired,
    className: PropTypes.string,
  };

  _mounted: boolean = false;
  _mouseDownTarget: HTMLElement = null;

  dropzone = React.createRef<DropZone>();
  sendButton = React.createRef<SendActionButton>();
  focusContainer = React.createRef<KeyCommandsRegion>();
  editor = React.createRef<ComposerEditor>();
  header = React.createRef<ComposerHeader>();

  _keymapHandlers = {
    'composer:send-message': () => this.sendButton.current.primarySend(),
    'composer:delete-empty-draft': () => this.props.draft.pristine && this._onDestroyDraft(),
    'composer:show-and-focus-bcc': () => this.header.current.showAndFocusField(Fields.Bcc),
    'composer:show-and-focus-cc': () => this.header.current.showAndFocusField(Fields.Cc),
    'composer:focus-to': () => this.header.current.showAndFocusField(Fields.To),
    'composer:show-and-focus-from': () => {},
    'composer:select-attachment': () => this._onSelectAttachment(),
  };

  constructor(props) {
    super(props);

    const draft = props.session.draft();

    this.state = {
      isDropping: false,
      quotedTextPresent: hasBlockquote(draft.bodyEditorState),
      quotedTextHidden: hideQuotedTextByDefault(draft),
    };
  }

  componentDidMount() {
    const { date, files } = this.props.draft;

    this._mounted = true;

    files.forEach(file => {
      if (Utils.shouldDisplayAsImage(file)) {
        Actions.fetchFile(file);
      }
    });

    // Note: the way this is implemented, `date` updates each time the draft is saved,
    // so this will autoselect the draft if it has been edited or created in the last 3s.
    const isBrandNew = Date.now() - (date instanceof Date ? date.getTime() : Number(date)) < 3000;
    if (isBrandNew) {
      (ReactDOM.findDOMNode(this) as HTMLElement).scrollIntoView(false);
      window.requestAnimationFrame(() => this.focus());
    }
  }

  componentDidUpdate() {
    const { draft } = this.props;

    // If the user has added an inline blockquote, show all the quoted text
    // note: this is necessary because it's hidden with CSS that can't be
    // made more specific.
    if (this.state.quotedTextHidden && hasNonTrailingBlockquote(draft.bodyEditorState)) {
      this.setState({ quotedTextHidden: false });
    }
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  focus() {
    if (!this._mounted || !this.header.current || !this.editor.current) return;

    // If something within us already has focus, don't change it. Never, ever
    // want to pull the cursor out from under the user while typing
    const node = ReactDOM.findDOMNode(this.focusContainer.current);
    if (node.contains(document.activeElement)) {
      return;
    }

    if (this.props.draft.to.length === 0 || this.props.draft.subject.length === 0) {
      this.header.current.focus();
    } else {
      this.editor.current.focus();
    }
  }

  _renderContent() {
    const { quotedTextHidden, quotedTextPresent } = this.state;
    const { draft, session } = this.props;

    return (
      <div className="composer-centered">
        <ComposerHeader ref={this.header} draft={draft} session={session} />
        <div
          className="compose-body"
          onMouseUp={this._onMouseUpComposerBody}
          onMouseDown={this._onMouseDownComposerBody}
        >
          <div className="composer-body-wrap">
            <ComposerEditor
              ref={this.editor}
              value={draft.bodyEditorState}
              className={quotedTextHidden && 'hiding-quoted-text'}
              propsForPlugins={{ draft, session }}
              onFileReceived={this._onFileReceived}
              onUpdatedSlateEditor={editor => session.setMountedEditor(editor)}
              onDrop={e => this.dropzone.current._onDrop(e)}
              onChange={change => {
                // We minimize thrashing and support editors in multiple windows by ensuring
                // non-value changes (eg focus) to the editorState don't trigger database saves
                const skipSaving =
                  change.operations.size &&
                  change.operations.every(
                    op =>
                      op.type === 'set_selection' ||
                      (op.type === 'set_value' &&
                        Object.keys(op.properties).every(k => k === 'decorations'))
                  );
                session.changes.add({ bodyEditorState: change.value }, { skipSaving });
              }}
            />
            <QuotedTextControl
              quotedTextHidden={quotedTextHidden}
              quotedTextPresent={quotedTextPresent}
              onUnhide={() => this.setState({ quotedTextHidden: false })}
              onRemove={() => {
                this.setState({ quotedTextHidden: false }, () =>
                  this.editor.current.removeQuotedText()
                );
              }}
            />
            <AttachmentsArea draft={draft} />
          </div>
          <div className="composer-footer-region">
            <InjectedComponentSet
              deferred
              direction="column"
              matching={{ role: 'Composer:Footer' }}
              exposedProps={{
                draft: draft,
                threadId: draft.threadId,
                headerMessageId: draft.headerMessageId,
                session: session,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // This lets us click outside of the `contenteditable`'s `contentBody`
  // and simulate what happens when you click beneath the text *in* the
  // contentEditable.

  // Unfortunately, we need to manually keep track of the "click" in
  // separate mouseDown, mouseUp events because we need to ensure that the
  // start and end target are both not in the contenteditable. This ensures
  // that this behavior doesn't interfear with a click and drag selection.
  _onMouseDownComposerBody = event => {
    if (ReactDOM.findDOMNode(this.editor.current).contains(event.target)) {
      this._mouseDownTarget = null;
    } else {
      this._mouseDownTarget = event.target;
    }
  };

  _inFooterRegion(el) {
    return el.closest && el.closest('.composer-footer-region');
  }

  _onMouseUpComposerBody = event => {
    if (event.target === this._mouseDownTarget && !this._inFooterRegion(event.target)) {
      // We don't set state directly here because we want the native
      // contenteditable focus behavior. When the contenteditable gets focused
      const bodyRect = (ReactDOM.findDOMNode(
        this.editor.current
      ) as HTMLElement).getBoundingClientRect();

      if (event.pageY < bodyRect.top) {
        this.editor.current.focus();
      } else {
        if (this.state.quotedTextHidden) {
          this.editor.current.focusEndReplyText();
        } else {
          this.editor.current.focusEndAbsolute();
        }
      }
    }
    this._mouseDownTarget = null;
  };

  _shouldAcceptDrop = event => {
    // Ensure that you can't pick up a file and drop it on the same draft
    const nonNativeFilePath = this._nonNativeFilePathForDrop(event);

    const hasNativeFile = event.dataTransfer.types.includes('Files');
    const hasNonNativeFilePath = nonNativeFilePath !== null;

    return hasNativeFile || hasNonNativeFilePath;
  };

  _nonNativeFilePathForDrop = event => {
    if (event.dataTransfer.types.includes('text/mailspring-file-url')) {
      const downloadURL = event.dataTransfer.getData('text/mailspring-file-url');
      const downloadFilePath = downloadURL.split('file://')[1];
      if (downloadFilePath) {
        return downloadFilePath;
      }
    }

    // Accept drops of images from within the app
    if (event.dataTransfer.types.includes('text/uri-list')) {
      const uri = event.dataTransfer.getData('text/uri-list');
      if (uri.indexOf('file://') === 0) {
        return decodeURI(uri.split('file://')[1]);
      }
    }
    return null;
  };

  _onDrop = event => {
    // Accept drops of real files from other applications
    for (const file of Array.from(event.dataTransfer.files)) {
      this._onFileReceived((file as any).path);
      event.preventDefault();
    }

    // Accept drops from attachment components / images within the app
    const uri = this._nonNativeFilePathForDrop(event);
    if (uri) {
      this._onFileReceived(uri);
      event.preventDefault();
    }
  };

  _onFileReceived = filePath => {
    // called from onDrop and onFilePaste - assume images should be inline
    Actions.addAttachment({
      filePath: filePath,
      headerMessageId: this.props.draft.headerMessageId,
      onCreated: file => {
        if (!this._mounted) return;
        if (Utils.shouldDisplayAsImage(file)) {
          const { draft, session } = this.props;
          const match = draft.files.find(f => f.id === file.id);
          if (!match) {
            return;
          }
          match.contentId = Utils.generateContentId();
          session.changes.add({
            files: [].concat(draft.files),
          });

          this.editor.current.insertInlineAttachment(file);
        }
      },
    });
  };

  _isValidDraft = (options: { force?: boolean } = {}) => {
    // We need to check the `DraftStore` because the `DraftStore` is
    // immediately and synchronously updated as soon as this function
    // fires. Since `setState` is asynchronous, if we used that as our only
    // check, then we might get a false reading.
    if (DraftStore.isSendingDraft(this.props.draft.headerMessageId)) {
      return false;
    }

    const dialog = remote.dialog;
    const { session } = this.props;
    const { errors, warnings } = session.validateDraftForSending();

    if (errors.length > 0) {
      dialog.showMessageBox(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: [localized('Edit Message'), localized('Cancel')],
        message: localized('Cannot send message'),
        detail: errors[0],
      });
      return false;
    }

    if (warnings.length > 0 && !options.force) {
      const response = dialog.showMessageBox(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: [localized('Send Anyway'), localized('Cancel')],
        message: localized('Are you sure?'),
        detail: warnings.join('. '),
      });
      if (response === 0) {
        // response is button array index
        return this._isValidDraft({ force: true });
      }
      return false;
    }
    return true;
  };

  _onDestroyDraft = () => {
    Actions.destroyDraft(this.props.draft);
  };

  _onSelectAttachment = () => {
    Actions.selectAttachment({ headerMessageId: this.props.draft.headerMessageId });
  };

  render() {
    return (
      <div className={this.props.className}>
        <KeyCommandsRegion
          localHandlers={this._keymapHandlers}
          className={'message-item-white-wrap composer-outer-wrap'}
          ref={this.focusContainer}
          tabIndex={-1}
        >
          <TabGroupRegion className="composer-inner-wrap">
            <DropZone
              ref={this.dropzone}
              className="composer-inner-wrap"
              shouldAcceptDrop={this._shouldAcceptDrop}
              onDragStateChange={({ isDropping }) => this.setState({ isDropping })}
              onDrop={this._onDrop}
            >
              <DropToAttachCover visible={this.state.isDropping} />

              <div className="composer-content-wrap">
                {AppEnv.isComposerWindow() ? (
                  <ScrollRegion className="compose-body-scroll">
                    {this._renderContent()}
                  </ScrollRegion>
                ) : (
                  this._renderContent()
                )}
              </div>

              <div className="composer-action-bar-workspace-wrap">
                <InjectedComponentSet
                  deferred
                  matching={{ role: 'Composer:ActionBarWorkspace' }}
                  exposedProps={{
                    draft: this.props.draft,
                    threadId: this.props.draft.threadId,
                    headerMessageId: this.props.draft.headerMessageId,
                    session: this.props.session,
                  }}
                />
              </div>

              <div className="composer-action-bar-wrap" data-tooltips-anchor>
                <div className="tooltips-container" />
                <div className="composer-action-bar-content">
                  <ActionBarPlugins
                    draft={this.props.draft}
                    session={this.props.session}
                    isValidDraft={this._isValidDraft}
                  />
                  <DeleteButton onClick={this._onDestroyDraft} />
                  <AttachFileButton onClick={this._onSelectAttachment} />

                  <div style={{ order: 0, flex: 1 }} />

                  <SendActionButton
                    tabIndex={-1}
                    ref={this.sendButton}
                    style={{ order: -100 }}
                    draft={this.props.draft}
                    isValidDraft={this._isValidDraft}
                  />
                </div>
              </div>
            </DropZone>
          </TabGroupRegion>
        </KeyCommandsRegion>
      </div>
    );
  }
}

const DropToAttachCover = (props: { visible: boolean }) => (
  <div className="composer-drop-cover" style={{ display: props.visible ? 'block' : 'none' }}>
    <div className="centered">
      <RetinaImg name="composer-drop-to-attach.png" mode={RetinaImg.Mode.ContentIsMask} />
      {localized(`Drop to Attach`)}
    </div>
  </div>
);

const AttachFileButton = (props: { onClick: () => void }) => (
  <button
    tabIndex={-1}
    className="btn btn-toolbar btn-attach"
    style={{ order: 50 }}
    title={localized('Attach File')}
    onClick={props.onClick}
  >
    <RetinaImg name="icon-composer-attachment.png" mode={RetinaImg.Mode.ContentIsMask} />
  </button>
);

const DeleteButton = (props: { onClick: () => void }) => (
  <button
    tabIndex={-1}
    className="btn btn-toolbar btn-trash"
    style={{ order: 100 }}
    title={localized('Delete Draft')}
    onClick={props.onClick}
  >
    <RetinaImg name="icon-composer-trash.png" mode={RetinaImg.Mode.ContentIsMask} />
  </button>
);
