_ = require 'underscore'
React = require 'react'

{File,
 Utils,
 Actions,
 DOMUtils,
 DraftStore,
 UndoManager,
 ContactStore,
 AccountStore,
 FileUploadStore,
 QuotedHTMLTransformer,
 FileDownloadStore,
 FocusedContentStore,
 ExtensionRegistry} = require 'nylas-exports'

{DropZone,
 RetinaImg,
 ScrollRegion,
 InjectedComponent,
 KeyCommandsRegion,
 InjectedComponentSet} = require 'nylas-component-kit'

FileUpload = require './file-upload'
ImageFileUpload = require './image-file-upload'

ComposerEditor = require './composer-editor'
SendActionButton = require './send-action-button'
ComposerHeader = require './composer-header'

Fields = require './fields'

# The ComposerView is a unique React component because it (currently) is a
# singleton. Normally, the React way to do things would be to re-render the
# Composer with new props.
class ComposerView extends React.Component
  @displayName: 'ComposerView'
  @containerRequired: false

  @propTypes:
    session: React.PropTypes.object.isRequired
    draft: React.PropTypes.object.isRequired

    # Sometimes when changes in the composer happens it's desirable to
    # have the parent scroll to a certain location. A parent component can
    # pass a callback that gets called when this composer wants to be
    # scrolled to.
    scrollTo: React.PropTypes.func

  constructor: (@props) ->
    @state =
      showQuotedText: false

  componentDidMount: =>
    @_receivedNewSession() if @props.session

  componentDidUpdate: (prevProps, prevState) =>
    # We want to use a temporary variable instead of putting this into the
    # state. This is because the selection is a transient property that
    # only needs to be applied once. It's not a long-living property of
    # the state. We could call `setState` here, but this saves us from a
    # re-rendering.
    @_recoveredSelection = null if @_recoveredSelection?

    # If the body changed, let's wait for the editor body to actually get rendered
    # into the dom before applying focus.
    # Since the editor is an InjectedComponent, when this function gets called
    # the editor hasn't actually finished rendering, so we need to wait for that
    # to happen by using the InjectedComponent's `onComponentDidRender` callback.
    # See `_renderEditor`
    bodyChanged = @props.body isnt prevProps.body
    return if bodyChanged

  focus: =>
    @focusFieldWithName(@_initiallyFocusedField())
    # TODO

  focusFieldWithName: (fieldName) =>
    return unless @refs[fieldName]

    $el = React.findDOMNode(@refs[fieldName])
    return if document.activeElement is $el or $el.contains(document.activeElement)
    if @refs[fieldName].focus
      @refs[fieldName].focus()
    else
      $el.select()
      $el.focus()

  _keymapHandlers: ->
    'composer:send-message': => @_onPrimarySend()
    'composer:delete-empty-draft': =>
      @_destroyDraft() if @props.draft.pristine
    'composer:show-and-focus-bcc': =>
      @refs.header.showField(Fields.Bcc)
    'composer:show-and-focus-cc': =>
      @refs.header.showField(Fields.Cc)
    'composer:focus-to': =>
      @refs.header.showField(Fields.To)
    "composer:show-and-focus-from": => # TODO
    "composer:undo": @undo
    "composer:redo": @redo

  componentWillReceiveProps: (newProps) =>
    if newProps.session isnt @props.session
      @_receivedNewSession()

  _receivedNewSession: =>
    @undoManager = new UndoManager
    @_saveToHistory()

    @setState({
      showQuotedText: Utils.isForwardedMessage(@props.draft)
    })

    @props.draft.files.forEach (file) ->
      if Utils.shouldDisplayAsImage(file)
        Actions.fetchFile(file)

  render: ->
    dropCoverDisplay = if @state.isDropping then 'block' else 'none'

    <KeyCommandsRegion
      localHandlers={@_keymapHandlers()}
      className={"message-item-white-wrap composer-outer-wrap #{@props.className ? ""}"}
      tabIndex="-1"
      ref="composerWrap">
      <DropZone
        className="composer-inner-wrap"
        shouldAcceptDrop={@_shouldAcceptDrop}
        onDragStateChange={ ({isDropping}) => @setState({isDropping}) }
        onDrop={@_onDrop}>
        <div className="composer-drop-cover" style={display: dropCoverDisplay}>
          <div className="centered">
            <RetinaImg
              name="composer-drop-to-attach.png"
              mode={RetinaImg.Mode.ContentIsMask}/>
            Drop to attach
          </div>
        </div>

        <div className="composer-content-wrap">
          {@_renderContentScrollRegion()}
        </div>

        <div className="composer-action-bar-wrap">
          {@_renderActionsRegion()}
        </div>
      </DropZone>
    </KeyCommandsRegion>

  _renderContentScrollRegion: ->
    if NylasEnv.isComposerWindow()
      <ScrollRegion className="compose-body-scroll" ref="scrollregion">
        {@_renderContent()}
      </ScrollRegion>
    else
      @_renderContent()

  _renderContent: =>
    <div className="composer-centered">
      <ComposerHeader
        ref="header"
        draft={@props.draft}
        session={@props.session}
      />
      <div
        className="compose-body"
        ref="composeBody"
        onMouseUp={@_onMouseUpComposerBody}
        onMouseDown={@_onMouseDownComposerBody}>
        {@_renderBodyRegions()}
        {@_renderFooterRegions()}
      </div>
    </div>

  _renderBodyRegions: =>
    <span ref="composerBodyWrap">
      {@_renderEditor()}
      {@_renderQuotedTextControl()}
      {@_renderAttachments()}
    </span>

  _renderEditor: ->
    exposedProps =
      body: @_removeQuotedText(@props.draft.body)
      draftClientId: @props.draft.clientId
      parentActions: {
        getComposerBoundingRect: @_getComposerBoundingRect
        scrollTo: @props.scrollTo
      }
      initialSelectionSnapshot: @_recoveredSelection
      onFilePaste: @_onFilePaste
      onBodyChanged: @_onBodyChanged

    # TODO Get rid of the unecessary required methods:
    # getCurrentSelection and getPreviousSelection shouldn't be needed and
    # undo/redo functionality should be refactored into ComposerEditor
    # _onDOMMutated is just for testing purposes, refactor the tests
    <InjectedComponent
      ref={Fields.Body}
      matching={role: "Composer:Editor"}
      fallback={ComposerEditor}
      onComponentDidRender={@_onEditorBodyDidRender}
      requiredMethods={[
        'focus'
        'focusAbsoluteEnd'
        'getCurrentSelection'
        'getPreviousSelection'
        '_onDOMMutated'
      ]}
      exposedProps={exposedProps} />

  # The contenteditable decides when to request a scroll based on the
  # position of the cursor and its relative distance to this composer
  # component. We provide it our boundingClientRect so it can calculate
  # this value.
  _getComposerBoundingRect: =>
    React.findDOMNode(@refs.composerWrap).getBoundingClientRect()

  _removeQuotedText: (html) =>
    if @state.showQuotedText then return html
    else return QuotedHTMLTransformer.removeQuotedHTML(html)

  _showQuotedText: (html) =>
    if @state.showQuotedText
      return html
    else
      return QuotedHTMLTransformer.appendQuotedHTML(html, @props.draft.body)

  _renderQuotedTextControl: ->
    if QuotedHTMLTransformer.hasQuotedHTML(@props.draft.body)
      <a className="quoted-text-control" onClick={@_onToggleQuotedText}>
        <span className="dots">&bull;&bull;&bull;</span>
      </a>
    else
      []

  _onToggleQuotedText: =>
    @setState showQuotedText: not @state.showQuotedText

  _renderFooterRegions: =>
    <div className="composer-footer-region">
      <InjectedComponentSet
        matching={role: "Composer:Footer"}
        exposedProps={draftClientId: @props.draft.clientId, threadId: @props.draft.threadId}
        direction="column"/>
    </div>

  _renderAttachments: ->
    <div className="attachments-area">
      {@_renderFileAttachments()}
      {@_renderUploadAttachments()}
    </div>

  _renderFileAttachments: ->
    nonImageFiles = @_nonImageFiles(@props.draft.files).map((file) =>
      @_renderFileAttachment(file, "Attachment")
    )
    imageFiles = @_imageFiles(@props.draft.files).map((file) =>
      @_renderFileAttachment(file, "Attachment:Image")
    )
    nonImageFiles.concat(imageFiles)

  _renderFileAttachment: (file, role) ->
    props =
      file: file
      removable: true
      targetPath: FileDownloadStore.pathForFile(file)
      messageClientId: @props.draft.clientId

    if role is "Attachment"
      className = "file-wrap"
    else
      className = "file-wrap file-image-wrap"

    <InjectedComponent key={file.id}
                       matching={role: role}
                       className={className}
                       exposedProps={props} />

  _renderUploadAttachments: ->
    nonImageUploads = @_nonImageFiles(@props.draft.uploads).map((upload) ->
      <FileUpload key={upload.id} upload={upload} />
    )
    imageUploads = @_imageFiles(@props.draft.uploads).map((upload) ->
      <ImageFileUpload key={upload.id} upload={upload} />
    )
    nonImageUploads.concat(imageUploads)

  _imageFiles: (files) ->
    _.filter(files, Utils.shouldDisplayAsImage)

  _nonImageFiles: (files) ->
    _.reject(files, Utils.shouldDisplayAsImage)

  _renderActionsRegion: =>
    <div className="composer-action-bar-content">
      <InjectedComponentSet
        className="composer-action-bar-plugins"
        matching={role: "Composer:ActionButton"}
        exposedProps={draftClientId: @props.draft.clientId, threadId: @props.draft.threadId} />

      <button
        tabIndex={-1}
        className="btn btn-toolbar btn-trash"
        style={order: 100}
        title="Delete draft"
        onClick={@_destroyDraft}>
        <RetinaImg name="icon-composer-trash.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>

      <button
        tabIndex={-1}
        className="btn btn-toolbar btn-attach"
        style={order: 50}
        title="Attach file"
        onClick={@_selectAttachment}>
        <RetinaImg name="icon-composer-attachment.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>

      <div style={order: 0, flex: 1} />

      <SendActionButton
        tabIndex={-1}
        draft={@props.draft}
        ref="sendActionButton"
        isValidDraft={@_isValidDraft}
      />
    </div>

  # This lets us click outside of the `contenteditable`'s `contentBody`
  # and simulate what happens when you click beneath the text *in* the
  # contentEditable.
  #
  # Unfortunately, we need to manually keep track of the "click" in
  # separate mouseDown, mouseUp events because we need to ensure that the
  # start and end target are both not in the contenteditable. This ensures
  # that this behavior doesn't interfear with a click and drag selection.
  _onMouseDownComposerBody: (event) =>
    if React.findDOMNode(@refs[Fields.Body]).contains(event.target)
      @_mouseDownTarget = null
    else @_mouseDownTarget = event.target

  _onMouseUpComposerBody: (event) =>
    if event.target is @_mouseDownTarget
      # We don't set state directly here because we want the native
      # contenteditable focus behavior. When the contenteditable gets focused
      # the focused field state will be properly set via editor.onFocus
      @refs[Fields.Body].focusAbsoluteEnd()
    @_mouseDownTarget = null

  _onMouseMoveComposeBody: (event) =>
    if @_mouseComposeBody is "down" then @_mouseComposeBody = "move"

  _initiallyFocusedField: ->
    {pristine, to, subject} = @props.draft

    return Fields.To if to.length is 0
    return Fields.Subject if (subject ? "").trim().length is 0
    return Fields.Body if NylasEnv.isComposerWindow() or pristine or
      (FocusedContentStore.didFocusUsingClick('thread') is true)
    return null

  _shouldAcceptDrop: (event) =>
    # Ensure that you can't pick up a file and drop it on the same draft
    nonNativeFilePath = @_nonNativeFilePathForDrop(event)

    hasNativeFile = event.dataTransfer.files.length > 0
    hasNonNativeFilePath = nonNativeFilePath isnt null

    return hasNativeFile or hasNonNativeFilePath

  _nonNativeFilePathForDrop: (event) =>
    if "text/nylas-file-url" in event.dataTransfer.types
      downloadURL = event.dataTransfer.getData("text/nylas-file-url")
      downloadFilePath = downloadURL.split('file://')[1]
      if downloadFilePath
        return downloadFilePath

    # Accept drops of images from within the app
    if "text/uri-list" in event.dataTransfer.types
      uri = event.dataTransfer.getData('text/uri-list')
      if uri.indexOf('file://') is 0
        uri = decodeURI(uri.split('file://')[1])
        return uri

    return null

  _onDrop: (e) =>
    # Accept drops of real files from other applications
    for file in e.dataTransfer.files
      Actions.addAttachment({filePath: file.path, messageClientId: @props.draft.clientId})

    # Accept drops from attachment components / images within the app
    if (uri = @_nonNativeFilePathForDrop(e))
      Actions.addAttachment({filePath: uri, messageClientId: @props.draft.clientId})

  _onFilePaste: (path) =>
    Actions.addAttachment({filePath: path, messageClientId: @props.draft.clientId})

  _onBodyChanged: (event) =>
    @_addToProxy({body: @_showQuotedText(event.target.value)})
    return

  _addToProxy: (changes={}, source={}) =>
    selections = @_getSelections()
    @props.session.changes.add(changes)

    if not source.fromUndoManager
      @_saveToHistory(selections)

  _isValidDraft: (options = {}) =>
    # We need to check the `DraftStore` because the `DraftStore` is
    # immediately and synchronously updated as soon as this function
    # fires. Since `setState` is asynchronous, if we used that as our only
    # check, then we might get a false reading.
    return false if DraftStore.isSendingDraft(@props.draft.clientId)

    {remote} = require('electron')
    dialog = remote.require('dialog')

    allRecipients = [].concat(@props.draft.to, @props.draft.cc, @props.draft.bcc)
    for contact in allRecipients
      if not ContactStore.isValidContact(contact)
        dealbreaker = "#{contact.email} is not a valid email address - please remove or edit it before sending."
    if allRecipients.length is 0
      dealbreaker = 'You need to provide one or more recipients before sending the message.'

    if dealbreaker
      dialog.showMessageBox(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: ['Edit Message', 'Cancel'],
        message: 'Cannot Send',
        detail: dealbreaker
      })
      return false

    bodyIsEmpty = @props.draft.body is @props.session.draftPristineBody()
    forwarded = Utils.isForwardedMessage(@props.draft)
    hasAttachment = (@props.draft.files ? []).length > 0 or (@props.draft.uploads ? []).length > 0

    warnings = []

    if @props.draft.subject.length is 0
      warnings.push('without a subject line')

    if @_mentionsAttachment(@props.draft.body) and not hasAttachment
      warnings.push('without an attachment')

    if bodyIsEmpty and not forwarded and not hasAttachment
      warnings.push('without a body')

    # Check third party warnings added via Composer extensions
    for extension in ExtensionRegistry.Composer.extensions()
      continue unless extension.warningsForSending
      warnings = warnings.concat(extension.warningsForSending({draft: @props.draft}))

    if warnings.length > 0 and not options.force
      response = dialog.showMessageBox(remote.getCurrentWindow(), {
        type: 'warning',
        buttons: ['Send Anyway', 'Cancel'],
        message: 'Are you sure?',
        detail: "Send #{warnings.join(' and ')}?"
      })
      if response is 0 # response is button array index
        return @_isValidDraft({force: true})
      else return false

    return true

  _onPrimarySend: ->
    @refs["sendActionButton"].primaryClick()

  _mentionsAttachment: (body) =>
    body = QuotedHTMLTransformer.removeQuotedHTML(body.toLowerCase().trim())
    signatureIndex = body.indexOf('<signature>')
    body = body[...signatureIndex] if signatureIndex isnt -1
    return body.indexOf("attach") >= 0

  _destroyDraft: =>
    Actions.destroyDraft(@props.draft.clientId)

  _selectAttachment: =>
    Actions.selectAttachment({messageClientId: @props.draft.clientId})

  undo: (event) =>
    event.preventDefault()
    event.stopPropagation()
    historyItem = @undoManager.undo() ? {}
    return unless historyItem.state?

    @_recoveredSelection = historyItem.currentSelection
    @_addToProxy(historyItem.state, fromUndoManager: true)
    @_recoveredSelection = null

  redo: (event) =>
    event.preventDefault()
    event.stopPropagation()
    historyItem = @undoManager.redo() ? {}
    return unless historyItem.state?

    @_recoveredSelection = historyItem.currentSelection
    @_addToProxy(historyItem.state, fromUndoManager: true)
    @_recoveredSelection = null

  _getSelections: =>
    currentSelection: @refs[Fields.Body]?.getCurrentSelection?()
    previousSelection: @refs[Fields.Body]?.getPreviousSelection?()

  _saveToHistory: (selections) =>
    selections ?= @_getSelections()

    historyItem =
      previousSelection: selections.previousSelection
      currentSelection: selections.currentSelection
      state:
        body: _.clone @props.draft.body
        subject: _.clone @props.draft.subject
        to: _.clone @props.draft.to
        cc: _.clone @props.draft.cc
        bcc: _.clone @props.draft.bcc

    lastState = @undoManager.current()
    if lastState?
      lastState.currentSelection = historyItem.previousSelection

    @undoManager.saveToHistory(historyItem)

module.exports = ComposerView
