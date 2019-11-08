import { remote } from 'electron';
import {
  React,
  ReactDOM,
  PropTypes,
  Utils,
  Actions,
  DraftStore,
  AttachmentStore,
  MessageStore,
  WorkspaceStore,
} from 'mailspring-exports';
import {
  DropZone,
  RetinaImg,
  ScrollRegion,
  TabGroupRegion,
  AttachmentItem,
  KeyCommandsRegion,
  ImageAttachmentItem,
  InjectedComponentSet,
  ComposerEditor,
  ComposerSupport,
  Spinner,
} from 'mailspring-component-kit';
import ComposerHeader from './composer-header';
import SendActionButton from './send-action-button';
import ActionBarPlugins from './action-bar-plugins';
import Fields from './fields';
import LottieImg from '../../../src/components/lottie-img';
import InjectedComponentErrorBoundary from '../../../src/components/injected-component-error-boundary';

const {
  hasBlockquote,
  hasNonTrailingBlockquote,
  hideQuotedTextByDefault,
  removeQuotedText,
} = ComposerSupport.BaseBlockPlugins;
const buttonTimer = 700;
const newDraftTimeDiff = 3000;
const TOOLBAR_MIN_WIDTH = 540;
// The ComposerView is a unique React component because it (currently) is a
// singleton. Normally, the React way to do things would be to re-render the
// Composer with new props.
export default class ComposerView extends React.Component {
  static displayName = 'ComposerView';

  static propTypes = {
    session: PropTypes.object.isRequired,
    draft: PropTypes.object.isRequired,
    className: PropTypes.string,
  };

  constructor(props) {
    super(props);

    this._els = {};
    this._mounted = false;

    this._keymapHandlers = {
      'composer:send-message': () => this._onPrimarySend(),
      'composer:delete-empty-draft': () => this.props.draft.pristine && this._onDestroyDraft(),
      'composer:show-and-focus-bcc': () => this._els.header.showAndFocusField(Fields.Bcc),
      'composer:show-and-focus-cc': () => this._els.header.showAndFocusField(Fields.Cc),
      'composer:focus-to': () => this._els.header.showAndFocusField(Fields.To),
      'composer:show-and-focus-from': () => {},
      'composer:select-attachment': () => this._onSelectAttachment(),
    };

    const draft = props.session.draft();
    this.state = {
      isDropping: false,
      quotedTextPresent: hasBlockquote(draft.bodyEditorState),
      quotedTextHidden: hideQuotedTextByDefault(draft),
      isDeleting: false,
      editorSelection: null,
      editorSelectedText: '',
      isCrowded: false,
      missingAttachments: true,
    };
    this._deleteTimer = null;
    this._unlisten = [
      Actions.destroyDraftFailed.listen(this._onDestroyedDraftProcessed, this),
      Actions.destroyDraftSucceeded.listen(this._onDestroyedDraftProcessed, this),
      Actions.removeQuoteText.listen(this._onQuoteRemoved, this),
      WorkspaceStore.listen(this._onResize),
    ];
  }

  componentDidMount() {
    this._mounted = true;
    this.props.draft.files.forEach(file => {
      if (Utils.shouldDisplayAsImage(file)) {
        Actions.fetchFile(file);
      }
    });

    const isBrandNew = this.props.draft.date >= MessageStore.lastThreadChangeTimestamp();
    if (isBrandNew) {
      ReactDOM.findDOMNode(this).scrollIntoView(false);
      this._animationFrameTimer = window.requestAnimationFrame(() => {
        this.focus();
      });
    }
    if (AppEnv.isComposerWindow()) {
      Actions.setCurrentWindowTitle(this._getToName(this.props.draft));
    }
    window.addEventListener('resize', this._onResize, true);
    this._onResize();
    this._isDraftMissingAttachments(this.props);
  }
  _getToName(participants) {
    if (!participants || !Array.isArray(participants.to) || participants.to.length === 0) {
      return '';
    }
    return participants.to[0].name || '';
  }
  UNSAFE_componentWillReceiveProps(newProps) {
    this._isDraftMissingAttachments(newProps);
  }

  componentDidUpdate() {
    const { draft } = this.props;
    const isNewDraft = draft && draft.isNewDraft();
    // If the user has added an inline blockquote, show all the quoted text
    // note: this is necessary because it's hidden with CSS that can't be
    // made more specific.
    if (
      this.state.quotedTextHidden &&
      (hasNonTrailingBlockquote(draft.bodyEditorState) || isNewDraft)
    ) {
      this.setState({ quotedTextHidden: false });
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._animationFrameTimer) {
      window.cancelAnimationFrame(this._animationFrameTimer);
    }
    for (let unlisten of this._unlisten) {
      unlisten();
    }
    window.removeEventListener('resize', this._onResize, true);
    // In the future, we should clean up the draft session entirely, or give it
    // the same lifecycle as the composer view. For now, just make sure we free
    // up all the memory used for undo/redo.
    // const { draft, session } = this.props;
    // session.changes.add({ bodyEditorState: draft.bodyEditorState.set('history', new History()) });
  }

  _onResize = () => {
    const container = document.querySelector('.RichEditor-toolbar');
    if (!container) {
      return;
    }
    let isCrowded = false;
    if (container.clientWidth <= TOOLBAR_MIN_WIDTH) {
      isCrowded = true;
    }
    if (isCrowded !== this.state.isCrowded) {
      this.setState({ isCrowded });
    }
  };

  _onQuoteRemoved({ headerMessageId = '' } = {}) {
    if (this._mounted && this.props.draft && this.props.draft.headerMessageId === headerMessageId) {
      this.setState({ quotedTextHidden: false, quotedTextPresent: false });
    }
  }

  _isDraftMissingAttachments = props => {
    if (!props.draft) {
      this.setState({ missingAttachments: false });
      return;
    }
    props.draft.missingAttachments().then(ret => {
      if (!this._mounted) {
        return;
      }
      const missing = ret.totalMissing();
      if (missing.length !== 0) {
        this.setState({ missingAttachments: true });
        Actions.fetchAttachments({
          accountId: props.draft.accountId,
          missingItems: missing.map(f => f.id),
        });
      } else {
        this.setState({ missingAttachments: false });
      }
    });
  };

  focus() {
    if (!this._mounted) return;

    // If something within us already has focus, don't change it. Never, ever
    // want to pull the cursor out from under the user while typing
    const node = ReactDOM.findDOMNode(this._els.composerWrap);
    if (node.contains(document.activeElement)) {
      return;
    }

    if (this.props.draft.to.length === 0 || this.props.draft.subject.length === 0) {
      this._els.header.focus();
      // the 'header' focus, should show some body,
      // it is a user-friendly expression that the body can scroll
      // DC-997
      this.scrollBodyInView(this._els.header);
    } else {
      this._els[Fields.Body].focus();
    }
  }

  scrollBodyInView(header) {
    const headerNode = ReactDOM.findDOMNode(header);
    if (!headerNode) {
      return;
    }
    const scroller = headerNode.closest('.scroll-region-content');
    if (!scroller) {
      return;
    }
    const scrollRect = scroller.getBoundingClientRect();
    const headerRect = headerNode.getBoundingClientRect();

    // the scrollTop range must in [scrollHeightMin ~ scrollHeightMax]
    const scrollHeightMax = scroller.scrollTop + (headerRect.y - scrollRect.y);
    const scrollHeightMin = scrollHeightMax - (scrollRect.height - headerRect.height);
    // show some mail body to mean that the body can scroll
    // the 200 is height to show of body
    let extraScrollTop = scrollHeightMin + 200;
    if (extraScrollTop > scrollHeightMax) {
      extraScrollTop = scrollHeightMax;
    } else if (extraScrollTop < 0) {
      extraScrollTop = 0;
    }

    scroller.scrollTop = extraScrollTop;
  }

  _renderContentScrollRegion() {
    if (AppEnv.isComposerWindow()) {
      return (
        <ScrollRegion
          className="compose-body-scroll"
          ref={el => {
            if (el) {
              this._els.scrollregion = el;
            }
          }}
        >
          {this._renderContent()}
        </ScrollRegion>
      );
    }
    return this._renderContent();
  }

  _onEditorBodyContextMenu = event => {
    if (this._els[Fields.Body] && this.state.editorSelection) {
      this._els[Fields.Body].openContextMenu({
        word: this.state.editorSelectedText,
        sel: this.state.editorSelection,
        hasSelectedText: !this.state.editorSelection.isCollapsed,
      });
    }
    event.preventDefault();
  };

  _renderContent() {
    const isMainWindow = AppEnv.isMainWindow();
    return (
      <InjectedComponentErrorBoundary key="composer-error">
        <div className="composer-centered">
          <ComposerHeader
            ref={el => {
              if (el) {
                this._els.header = el;
              }
            }}
            draft={this.props.draft}
            session={this.props.session}
            initiallyFocused={this.props.draft.to.length === 0}
          />
          <div
            className="compose-body"
            ref={el => {
              if (el) {
                this._els.composeBody = el;
              }
            }}
            onMouseUp={this._onMouseUpComposerBody}
            onMouseDown={this._onMouseDownComposerBody}
            onContextMenu={this._onEditorBodyContextMenu}
          >
            {this._renderBodyRegions()}
            {this._renderFooterRegions()}
            {!isMainWindow && this._renderActionsRegion()}
          </div>
        </div>
      </InjectedComponentErrorBoundary>
    );
  }

  _draftNotReady() {
    return this.state.missingAttachments || (this.props.draft && this.props.draft.waitingForBody);
  }

  _renderBodyRegions() {
    if (this._draftNotReady()) {
      return (
        <div className="message-body-loading">
          <RetinaImg
            name="inline-loading-spinner.gif"
            mode={RetinaImg.Mode.ContentDark}
            style={{ width: 14, height: 14 }}
          />
        </div>
      );
    }
    return (
      <div className="composer-body-wrap">
        {this._renderEditor()}
        {this._renderQuotedTextControl()}
        {this._renderAttachments()}
      </div>
    );
  }

  _renderQuotedTextControl() {
    if (!this.state.quotedTextPresent || !this.state.quotedTextHidden) {
      return false;
    }
    return (
      <a
        className="quoted-text-control"
        title="Show trimmed content"
        onMouseDown={e => {
          if (e.target.closest('.remove-quoted-text')) return;
          e.preventDefault();
          e.stopPropagation();
          this.setState({ quotedTextHidden: false });
        }}
      >
        <span className="dots">
          <RetinaImg
            name={'expand-more.svg'}
            style={{ width: 24, height: 24 }}
            isIcon
            mode={RetinaImg.Mode.ContentIsMask}
          />
        </span>
        <span
          className="remove-quoted-text"
          onMouseUp={e => {
            e.preventDefault();
            e.stopPropagation();
            const { draft, session } = this.props;
            const change = removeQuotedText(draft.bodyEditorState);
            session.changes.add({ bodyEditorState: change.value });
            if (draft) {
              Actions.removeQuoteText({ headerMessageId: draft.headerMessageId });
            }
            this.setState({ quotedTextHidden: false });
          }}
        >
          <RetinaImg
            title="Remove quoted text"
            name="image-cancel-button.png"
            mode={RetinaImg.Mode.ContentPreserve}
          />
        </span>
      </a>
    );
  }

  _onEditorBlur = (event, editor, next) => {
    this.setState({
      editorSelection: editor.value.selection,
      editorSelectedText: editor.value.fragment.text,
    });
    this._onEditorChange(editor);
  };
  _onEditorChange = change => {
    // We minimize thrashing and disable editors in multiple windows by ensuring
    // non-value changes (eg focus) to the editorState don't trigger database saves
    if (!this.props.session.isPopout()) {
      const skipSaving = change.operations.every(({ type, properties }) => {
        return (
          type === 'set_selection' ||
          (type === 'set_value' &&
            Object.keys(properties).every(k => {
              if (k === 'schema') {
                //In case we encountered more scheme change
                // console.error('schema');
              }
              return k === 'decorations' || k === 'schema';
            }))
        );
      });
      this.props.session.changes.add({ bodyEditorState: change.value }, { skipSaving });
    }
  };

  _renderEditor() {
    return (
      <ComposerEditor
        ref={el => {
          if (el) {
            this._els[Fields.Body] = el;
          }
        }}
        className={this.state.quotedTextHidden && 'hiding-quoted-text'}
        propsForPlugins={{ draft: this.props.draft, session: this.props.session }}
        value={this.props.draft.bodyEditorState}
        onFileReceived={this._onFileReceived}
        onDrop={e => this._dropzone._onDrop(e)}
        onBlur={this._onEditorBlur}
        readOnly={this.props.session ? this.props.session.isPopout() : true}
        onChange={this._onEditorChange}
        isCrowded={this.state.isCrowded}
      />
    );
  }

  _renderFooterRegions() {
    return (
      <div className="composer-footer-region">
        <InjectedComponentSet
          deferred
          matching={{ role: 'Composer:Footer' }}
          exposedProps={{
            draft: this.props.draft,
            threadId: this.props.draft.threadId,
            headerMessageId: this.props.draft.headerMessageId,
            session: this.props.session,
          }}
          direction="column"
        />
      </div>
    );
  }

  _renderAttachments() {
    const { files, headerMessageId } = this.props.draft;
    const nonImageFiles = files
      .filter(f => !Utils.shouldDisplayAsImage(f))
      .map(file => (
        <AttachmentItem
          key={file.id}
          className="file-upload"
          draggable={false}
          filePath={AttachmentStore.pathForFile(file)}
          displayName={file.filename}
          displaySize={file.displayFileSize()}
          fileIconName={`file-${file.extension}.png`}
          onRemoveAttachment={() => Actions.removeAttachment(headerMessageId, file)}
          onOpenAttachment={() => Actions.fetchAndOpenFile(file)}
        />
      ));
    const imageFiles = files
      .filter(f => Utils.shouldDisplayAsImage(f))
      .filter(f => !f.contentId)
      .map(file => (
        <ImageAttachmentItem
          key={file.id}
          draggable={false}
          className="file-upload"
          filePath={AttachmentStore.pathForFile(file)}
          displayName={file.filename}
          onRemoveAttachment={() => Actions.removeAttachment(headerMessageId, file)}
          onOpenAttachment={() => Actions.fetchAndOpenFile(file)}
        />
      ));
    const nonInlineWithContentIdImageFiles = files
      .filter(f => Utils.shouldDisplayAsImage(f))
      .filter(f => f.contentId)
      .filter(f => !this.props.draft.body.includes(`cid:${f.contentId}`))
      .map(file => (
        <ImageAttachmentItem
          key={file.id}
          draggable={false}
          className="file-upload"
          filePath={AttachmentStore.pathForFile(file)}
          displayName={file.filename}
          onRemoveAttachment={() => Actions.removeAttachment(headerMessageId, file)}
          onOpenAttachment={() => Actions.fetchAndOpenFile(file)}
        />
      ));

    return (
      <div className="attachments-area">
        {nonImageFiles.concat(imageFiles, nonInlineWithContentIdImageFiles)}
      </div>
    );
  }

  _renderActionsWorkspaceRegion() {
    return (
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
    );
  }

  _renderActionsRegion() {
    return (
      <div className="sendbar-for-dock">
        <div className="action-bar-wrapper">
          <div className="composer-action-bar-wrap" data-tooltips-anchor>
            <div className="tooltips-container" />
            <div className="composer-action-bar-content">
              <ActionBarPlugins
                draft={this.props.draft}
                session={this.props.session}
                isValidDraft={this._isValidDraft}
              />
              <SendActionButton
                ref={el => {
                  if (el) {
                    this._els.sendActionButton = el;
                  }
                }}
                tabIndex={-1}
                style={{ order: -52 }}
                draft={this.props.draft}
                headerMessageId={this.props.draft.headerMessageId}
                session={this.props.session}
                isValidDraft={this._isValidDraft}
                disabled={this.props.session.isPopout() || this._draftNotReady()}
              />
              <div className="divider-line" style={{ order: -51 }} />
              <button
                tabIndex={-1}
                className="btn btn-toolbar btn-attach"
                style={{ order: -50 }}
                title="Attach file"
                onClick={this._onSelectAttachment.bind(this, { type: 'notInline' })}
                disabled={this.props.session.isPopout() || this._draftNotReady()}
              >
                <RetinaImg
                  name={'attachments.svg'}
                  style={{ width: 24, height: 24 }}
                  isIcon
                  mode={RetinaImg.Mode.ContentIsMask}
                />
              </button>
              <button
                tabIndex={-1}
                className="btn btn-toolbar btn-attach"
                style={{ order: -49 }}
                title="Insert photo"
                onClick={this._onSelectAttachment.bind(this, { type: 'image' })}
                disabled={this.props.session.isPopout() || this._draftNotReady()}
              >
                <RetinaImg
                  name={'inline-image.svg'}
                  style={{ width: 24, height: 24 }}
                  isIcon
                  mode={RetinaImg.Mode.ContentIsMask}
                />
              </button>
              <div className="divider-line" style={{ order: 10 }} />
              <button
                tabIndex={-1}
                className="btn btn-toolbar btn-trash"
                style={{ order: 40 }}
                title="Delete draft"
                onClick={this._onDestroyDraft}
                disabled={this.props.session.isPopout() || this._draftNotReady()}
              >
                {this.state.isDeleting ? (
                  <LottieImg name={'loading-spinner-blue'} size={{ width: 24, height: 24 }} />
                ) : (
                  <RetinaImg
                    name={'trash.svg'}
                    style={{ width: 24, height: 24 }}
                    isIcon
                    mode={RetinaImg.Mode.ContentIsMask}
                  />
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="wrapper-space"></div>
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
    if (ReactDOM.findDOMNode(this._els[Fields.Body]).contains(event.target)) {
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
      const bodyRect = ReactDOM.findDOMNode(this._els[Fields.Body]).getBoundingClientRect();
      if (event.pageY < bodyRect.top) {
        this._els[Fields.Body].focus();
      } else {
        if (this.state.quotedTextHidden) {
          this._els[Fields.Body].focusEndReplyText();
        } else {
          this._els[Fields.Body].focusEndAbsolute();
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
    if (event.dataTransfer.types.includes('text/nylas-file-url')) {
      const downloadURL = event.dataTransfer.getData('text/nylas-file-url');
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
      this._onFileReceived(file.path);
      event.preventDefault();
    }

    // Accept drops from attachment components / images within the app
    const uri = this._nonNativeFilePathForDrop(event);
    if (uri) {
      this._onFileReceived(uri);
      event.preventDefault();
    }
  };

  _onAttachmentsCreated = fileObjs => {
    if (!this._mounted) return;
    if (!Array.isArray(fileObjs) || fileObjs.length === 0) {
      return;
    }
    const { draft, session } = this.props;
    for (let i = 0; i < fileObjs.length; i++) {
      const fileObj = fileObjs[i];
      if (Utils.shouldDisplayAsImage(fileObj)) {
        const match = draft.files.find(f => f.id === fileObj.id);
        if (!match) {
          return;
        }
        match.contentId = Utils.generateContentId();
        match.isInline = true;
        session.changes.add({
          files: [].concat(draft.files),
        });
      }
    }
    this._els[Fields.Body].insertInlineAttachments(fileObjs);
    session.changes.commit();
  };

  _onAttachmentCreated = fileObj => {
    if (!this._mounted) return;
    if (Utils.shouldDisplayAsImage(fileObj)) {
      const { draft, session } = this.props;
      const match = draft.files.find(f => f.id === fileObj.id);
      if (!match) {
        return;
      }
      match.contentId = Utils.generateContentId();
      match.isInline = true;
      session.changes.add({
        files: [].concat(draft.files),
      });
      this._els[Fields.Body].insertInlineAttachment(fileObj);
      session.changes.commit();
    }
  };

  _onFileReceived = filePath => {
    // called from onDrop and onFilePaste - assume images should be inline
    Actions.addAttachment({
      filePath: filePath,
      headerMessageId: this.props.draft.headerMessageId,
      onCreated: this._onAttachmentCreated,
    });
  };

  _isValidDraft = (options = {}) => {
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
        buttons: ['Edit Message', 'Cancel'],
        message: 'Cannot Send',
        detail: errors[0],
      });
      return false;
    }

    if (warnings.length > 0 && !options.force) {
      dialog
        .showMessageBox(remote.getCurrentWindow(), {
          type: 'warning',
          buttons: ['Send Anyway', 'Cancel'],
          message: 'Are you sure?',
          detail: `Send ${warnings.join(' and ')}?`,
        })
        .then(({ response } = {}) => {
          if (response === 0) {
            this._onPrimarySend({ disableDraftCheck: true });
            return true;
          }
        });
      return false;
    }
    return true;
  };

  _onPrimarySend = ({ disableDraftCheck = false } = {}) => {
    this._els.sendActionButton.primarySend({ disableDraftCheck });
  };
  _timoutButton = () => {
    if (!this._deleteTimer) {
      this._deleteTimer = setTimeout(() => {
        if (this._mounted) {
          this.setState({ isDeleting: false });
        }
        this._deleteTimer = null;
      }, buttonTimer);
    }
  };

  _onDestroyedDraftProcessed = ({ messageIds }) => {
    if (!this.props.draft) {
      return;
    }
    if (messageIds.includes(this.props.draft.id)) {
      if (this._deleteTimer) {
        return;
      }
      this._deleteTimer = setTimeout(() => {
        if (this._mounted) {
          this.setState({ isDeleting: false });
        }
        this._deleteTimer = null;
      }, buttonTimer);
    }
  };

  _onDestroyDraft = () => {
    if (!this.state.isDeleting && !this._deleteTimer) {
      this._timoutButton();
      this.setState({ isDeleting: true });
      Actions.destroyDraft([this.props.draft]);
    }
  };

  _onSelectAttachment = ({ type = 'image' }) => {
    if (type === 'image') {
      Actions.selectAttachment({
        headerMessageId: this.props.draft.headerMessageId,
        onCreated: fileObjs => {
          if (Array.isArray(fileObjs)) {
            this._onAttachmentsCreated(fileObjs);
          } else {
            this._onAttachmentCreated(fileObjs);
          }
        },
        type,
      });
    } else {
      Actions.selectAttachment({ headerMessageId: this.props.draft.headerMessageId, type });
    }
  };

  render() {
    const dropCoverDisplay = this.state.isDropping ? 'block' : 'none';
    const isMainWindow = AppEnv.isMainWindow();
    return (
      <div className={this.props.className}>
        <KeyCommandsRegion
          localHandlers={this._keymapHandlers}
          className={'message-item-white-wrap focused composer-outer-wrap'}
          ref={el => {
            if (el) {
              this._els.composerWrap = el;
            }
          }}
          tabIndex="-1"
        >
          <TabGroupRegion className="composer-inner-wrap">
            <DropZone
              ref={cm => (this._dropzone = cm)}
              className="composer-inner-wrap"
              shouldAcceptDrop={this._shouldAcceptDrop}
              onDragStateChange={({ isDropping }) => this.setState({ isDropping })}
              onDrop={this._onDrop}
            >
              <div className="composer-drop-cover" style={{ display: dropCoverDisplay }}>
                <div className="centered">
                  <RetinaImg
                    name="composer-drop-to-attach.png"
                    mode={RetinaImg.Mode.ContentIsMask}
                  />
                  Drop to attach
                </div>
              </div>

              <div className="composer-content-wrap">{this._renderContentScrollRegion()}</div>

              <div className="composer-action-bar-workspace-wrap">
                {this._renderActionsWorkspaceRegion()}
              </div>
            </DropZone>
          </TabGroupRegion>
          {isMainWindow && this._renderActionsRegion()}
        </KeyCommandsRegion>
      </div>
    );
  }
}
