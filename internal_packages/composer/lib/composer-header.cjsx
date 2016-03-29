_ = require 'underscore'
React = require 'react'
AccountContactField = require './account-contact-field'
ParticipantsTextField = require './participants-text-field'
{Actions, AccountStore} = require 'nylas-exports'
{RetinaImg, FluxContainer, KeyCommandsRegion} = require 'nylas-component-kit'

CollapsedParticipants = require './collapsed-participants'
ComposerHeaderActions = require './composer-header-actions'

Fields = require './fields'

class ComposerHeader extends React.Component
  @displayName: "ComposerHeader"

  @propTypes:
    draft: React.PropTypes.object

    # Callback for the participants change
    onChangeParticipants: React.PropTypes.func

  constructor: (@props={}) ->
    @_renderCallCount = 0
    @state = {
      enabledFields: @_initiallyEnabledFields(@props.draft)
    }

  componentWillReceiveProps: (nextProps) =>
    if @props.session isnt nextProps.session
      @setState(enabledFields: @_initiallyEnabledFields(nextProps.draft))
    else
      @_ensureFilledFieldsEnabled(nextProps.draft)

  componentDidUpdate: =>
    @_renderCallCount += 1

  afterRendering: (cb) =>
    desired = @_renderCallCount + 1
    attempt = =>
      return cb() if @_renderCallCount is desired
      window.requestAnimationFrame(attempt)
    attempt()

  showField: (fieldName) =>
    enabledFields = _.uniq([].concat(@state.enabledFields, [fieldName]))
    @afterRendering =>
      @refs[fieldName].focus()
    @setState({enabledFields})

  shiftFieldFocus: (fieldName, dir) =>
    sortedEnabledFields = @state.enabledFields.sort (a, b) =>
      Fields.Order[a] - Fields.Order[b]

    i = sortedEnabledFields.indexOf(fieldName)
    next = null
    while (i > 0 && i < sortedEnabledFields.length - 1)
      i += dir
      next = @refs[sortedEnabledFields[i]]
      break if next

    next.focus() if next

  hideField: (fieldName) =>
    if React.findDOMNode(@refs[fieldName]).contains(document.activeElement)
      @shiftFieldFocus(fieldName, -1)
    enabledFields = _.without(@state.enabledFields, fieldName)
    @setState({enabledFields})

  render: ->
    <div className="composer-header">
      <ComposerHeaderActions
        draftClientId={@props.draft.clientId}
        enabledFields={@state.enabledFields}
        participantsFocused={@state.participantsFocused}
        onShowField={@showField}
      />
      {@_renderParticipants()}
      {@_renderSubject()}
    </div>

  _renderParticipants: =>
    if @state.participantsFocused
      content = @_renderFields()
    else
      content = (
        <CollapsedParticipants
          to={@props.draft.to}
          cc={@props.draft.cc}
          bcc={@props.draft.bcc}
        />
      )

    <KeyCommandsRegion
      ref="participantsContainer"
      className="expanded-participants"
      onFocusIn={=>
        @afterRendering =>
          fieldName = @state.participantsLastActiveField || Fields.To
          @refs[fieldName].focus()
        @setState(participantsFocused: true, participantsLastActiveField: null)
      }
      onFocusOut={ (lastFocusedEl) =>
        active = Fields.ParticipantFields.find (fieldName) =>
          return false if not @refs[fieldName]
          return React.findDOMNode(@refs[fieldName]).contains(lastFocusedEl)
        @setState(participantsFocused: false, participantsLastActiveField: active)
      }>
      {content}
    </KeyCommandsRegion>

  _renderSubject: =>
    return false unless Fields.Subject in @state.enabledFields

    <div key="subject-wrap" className="compose-subject-wrap">
      <input type="text"
             name="subject"
             ref={Fields.Subject}
             placeholder="Subject"
             value={@state.subject}
             onChange={@_onChangeSubject}/>
    </div>

  _renderFields: =>
    {to, cc, bcc, from} = @props.draft

    # Note: We need to physically add and remove these elements, not just hide them.
    # If they're hidden, shift-tab between fields breaks.
    fields = []
    fields.push(
      <ParticipantsTextField
        ref={Fields.To}
        key="to"
        field='to'
        change={@_onChangeParticipants}
        className="composer-participant-field to-field"
        participants={{to, cc, bcc}} />
    )

    if Fields.Cc in @state.enabledFields
      fields.push(
        <ParticipantsTextField
          ref={Fields.Cc}
          key="cc"
          field='cc'
          change={@_onChangeParticipants}
          onEmptied={ => @hideField(Fields.Cc) }
          className="composer-participant-field cc-field"
          participants={{to, cc, bcc}} />
      )

    if Fields.Bcc in @state.enabledFields
      fields.push(
        <ParticipantsTextField
          ref={Fields.Bcc}
          key="bcc"
          field='bcc'
          change={@_onChangeParticipants}
          onEmptied={ => @hideField(Fields.Bcc) }
          className="composer-participant-field bcc-field"
          participants={{to, cc, bcc}} />
      )

    if Fields.From in @state.enabledFields
      fields.push(
        <FluxContainer
          stores={[AccountStore]}
          getStateFromStores={ =>
            if @props.draft.threadId
              {accounts: [AccountStore.accountForId(@props.draft.accountId)]}
            else
              {accounts: AccountStore.accounts()}
          }>
          <AccountContactField
            key="from"
            ref={Fields.From}
            onChange={@_onChangeParticipants}
            accounts={@props.accounts}
            value={from[0]}
           />
        </FluxContainer>
      )

    fields

  _ensureFilledFieldsEnabled: (draft) ->
    enabledFields = @state.enabledFields
    enabledFields = enabledFields.concat([Fields.Cc]) if not _.isEmpty(draft.cc)
    enabledFields = enabledFields.concat([Fields.Bcc]) if not _.isEmpty(draft.bcc)
    if enabledFields isnt @state.enabledFields
      @setState({enabledFields})

  _initiallyEnabledFields: (draft) ->
    return [] unless draft
    enabledFields = [Fields.To]
    enabledFields.push Fields.Cc if not _.isEmpty(draft.cc)
    enabledFields.push Fields.Bcc if not _.isEmpty(draft.bcc)
    enabledFields.push Fields.From if @_shouldShowFromField(draft)
    enabledFields.push Fields.Subject if @_shouldEnableSubject()
    enabledFields.push Fields.Body
    return enabledFields

  _shouldShowFromField: (draft) =>
    return true if draft
    return false

  _shouldEnableSubject: =>
    if _.isEmpty(@props.draft.subject ? "") then return true
    else if @isForwardedMessage() then return true
    else if @props.draft.replyToMessageId then return false
    else return true

  _onChangeParticipants: (changes) =>
    @props.session.changes.add(changes)
    Actions.draftParticipantsChanged(@props.draft.clientId, changes)

  _onChangeSubject: (event) =>
    @props.session.changes.add(subject: event.target.value)

module.exports = ComposerHeader
