React = require 'react'
_ = require 'underscore'
{DraftStore, Actions} = require 'nylas-exports'

class DraftSessionContainer extends React.Component
  @displayName: 'DraftSessionContainer'
  @propTypes:
    children: React.PropTypes.element
    draftClientId: React.PropTypes.string

  constructor: ->
    @state =
      session: null
      draft: null

  componentWillMount: =>
    @_unmounted = false
    @_prepareForDraft(@props.draftClientId)

  componentWillUnmount: =>
    @_unmounted = true
    @_teardownForDraft()
    @_deleteDraftIfEmpty()

  componentWillReceiveProps: (newProps) =>
    if newProps.draftClientId isnt @props.draftClientId
      @_teardownForDraft()
      @_prepareForDraft(newProps.draftClientId)

  _prepareForDraft: (draftClientId) =>
    return unless draftClientId

    DraftStore.sessionForClientId(draftClientId).then (session) =>
      return if @_unmounted
      return if session.draftClientId isnt @props.draftClientId

      @_sessionUnlisten = session.listen =>
        @setState(draft: session.draft())

      @setState({
        session: session,
        draft: session.draft()
      })

  _teardownForDraft: =>
    if @state.session
      @state.session.changes.commit()
    @_sessionUnlisten() if @_sessionUnlisten

  _deleteDraftIfEmpty: =>
    return unless @state.draft
    if @state.draft.pristine
      Actions.destroyDraft(@props.draftClientId)

  render: ->
    return <span/> unless @state.draft
    otherProps = _.omit(@props, Object.keys(@constructor.propTypes))
    React.cloneElement(@props.children, _.extend({}, otherProps, @state))

module.exports = DraftSessionContainer
