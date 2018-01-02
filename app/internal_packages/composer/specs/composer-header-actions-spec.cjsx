React = require 'react'
ReactDOM = require 'react-dom'
ComposerHeaderActions = require('../lib/composer-header-actions').default
Fields = require('../lib/fields').default
ReactTestUtils = require('react-dom/test-utils')
{Actions} = require 'mailspring-exports'

describe "ComposerHeaderActions", ->
  makeField = (props = {}) ->
    @onShowAndFocusField = jasmine.createSpy("onShowAndFocusField")
    props.onShowAndFocusField = @onShowAndFocusField
    props.enabledFields ?= []
    props.headerMessageId = 'a'
    @component = ReactTestUtils.renderIntoDocument(
      <ComposerHeaderActions {...props} />
    )

  it "renders the 'show' buttons for 'cc', 'bcc'", ->
    makeField.call(@, {enabledFields: [Fields.To], })
    showCc = ReactTestUtils.findRenderedDOMComponentWithClass(@component, "show-cc")
    showBcc = ReactTestUtils.findRenderedDOMComponentWithClass(@component, "show-bcc")
    showSubject = ReactTestUtils.findRenderedDOMComponentWithClass(@component, "show-subject")
    expect(showCc).toBeDefined()
    expect(showBcc).toBeDefined()

  it "hides show cc if it's enabled", ->
    makeField.call(@, {enabledFields: [Fields.To, Fields.Cc]})
    els = ReactTestUtils.scryRenderedDOMComponentsWithClass(@component, "show-cc")
    expect(els.length).toBe 0

  it "hides show bcc if it's enabled", ->
    makeField.call(@, {enabledFields: [Fields.To, Fields.Bcc]})
    els = ReactTestUtils.scryRenderedDOMComponentsWithClass(@component, "show-bcc")
    expect(els.length).toBe 0

  it "hides show subject if it's enabled", ->
    makeField.call(@, {enabledFields: [Fields.To, Fields.Subject]})
    els = ReactTestUtils.scryRenderedDOMComponentsWithClass(@component, "show-subject")
    expect(els.length).toBe 0

  it "renders 'popout composer' in the inline mode", ->
    makeField.call(@, {enabledFields: [Fields.To]})
    els = ReactTestUtils.scryRenderedDOMComponentsWithClass(@component, "show-popout")
    expect(els.length).toBe 1

  it "doesn't render 'popout composer' if in a composer window", ->
    spyOn(AppEnv, 'isComposerWindow').andReturn(true)
    makeField.call(@, {enabledFields: [Fields.To]})
    els = ReactTestUtils.scryRenderedDOMComponentsWithClass(@component, "show-popout")
    expect(els.length).toBe 0

  it "pops out the composer when clicked", ->
    spyOn(Actions, "composePopoutDraft")
    makeField.call(@, {enabledFields: [Fields.To]})
    el = ReactTestUtils.findRenderedDOMComponentWithClass(@component, "show-popout")
    ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(el))
    expect(Actions.composePopoutDraft).toHaveBeenCalled()

  it "shows and focuses cc when clicked", ->
    makeField.call(@, {enabledFields: [Fields.To]})
    el = ReactTestUtils.findRenderedDOMComponentWithClass(@component, "show-cc")
    ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(el))
    expect(@onShowAndFocusField).toHaveBeenCalledWith Fields.Cc

  it "shows and focuses bcc when clicked", ->
    makeField.call(@, {enabledFields: [Fields.To]})
    el = ReactTestUtils.findRenderedDOMComponentWithClass(@component, "show-bcc")
    ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(el))
    expect(@onShowAndFocusField).toHaveBeenCalledWith Fields.Bcc

  it "shows subject when clicked", ->
    makeField.call(@, {enabledFields: [Fields.To]})
    el = ReactTestUtils.findRenderedDOMComponentWithClass(@component, "show-subject")
    ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(el))
    expect(@onShowAndFocusField).toHaveBeenCalledWith Fields.Subject
