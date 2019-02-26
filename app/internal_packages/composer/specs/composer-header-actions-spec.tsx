const React = require('react');
const ReactDOM = require('react-dom');
const ComposerHeaderActions = require('../lib/composer-header-actions').default;
const Fields = require('../lib/fields').default;
const ReactTestUtils = require('react-dom/test-utils');
const { Actions } = require('mailspring-exports');

describe('ComposerHeaderActions', function() {
  const makeField = function(props) {
    if (props == null) {
      props = {};
    }
    this.onShowAndFocusField = jasmine.createSpy('onShowAndFocusField');
    props.onShowAndFocusField = this.onShowAndFocusField;
    if (props.enabledFields == null) {
      props.enabledFields = [];
    }
    props.headerMessageId = 'a';
    this.component = ReactTestUtils.renderIntoDocument(<ComposerHeaderActions {...props} />);
  };

  it("renders the 'show' buttons for 'cc', 'bcc'", function() {
    makeField.call(this, { enabledFields: [Fields.To] });
    const showCc = ReactTestUtils.findRenderedDOMComponentWithClass(this.component, 'show-cc');
    const showBcc = ReactTestUtils.findRenderedDOMComponentWithClass(this.component, 'show-bcc');
    expect(showCc).toBeDefined();
    expect(showBcc).toBeDefined();
  });

  it("hides show cc if it's enabled", function() {
    makeField.call(this, { enabledFields: [Fields.To, Fields.Cc] });
    const els = ReactTestUtils.scryRenderedDOMComponentsWithClass(this.component, 'show-cc');
    expect(els.length).toBe(0);
  });

  it("hides show bcc if it's enabled", function() {
    makeField.call(this, { enabledFields: [Fields.To, Fields.Bcc] });
    const els = ReactTestUtils.scryRenderedDOMComponentsWithClass(this.component, 'show-bcc');
    expect(els.length).toBe(0);
  });

  it("hides show subject if it's enabled", function() {
    makeField.call(this, { enabledFields: [Fields.To, Fields.Subject] });
    const els = ReactTestUtils.scryRenderedDOMComponentsWithClass(this.component, 'show-subject');
    expect(els.length).toBe(0);
  });

  it("renders 'popout composer' in the inline mode", function() {
    makeField.call(this, { enabledFields: [Fields.To] });
    const els = ReactTestUtils.scryRenderedDOMComponentsWithClass(this.component, 'show-popout');
    expect(els.length).toBe(1);
  });

  it("doesn't render 'popout composer' if in a composer window", function() {
    spyOn(AppEnv, 'isComposerWindow').andReturn(true);
    makeField.call(this, { enabledFields: [Fields.To] });
    const els = ReactTestUtils.scryRenderedDOMComponentsWithClass(this.component, 'show-popout');
    expect(els.length).toBe(0);
  });

  it('pops out the composer when clicked', function() {
    spyOn(Actions, 'composePopoutDraft');
    makeField.call(this, { enabledFields: [Fields.To] });
    const el = ReactTestUtils.findRenderedDOMComponentWithClass(this.component, 'show-popout');
    ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(el));
    expect(Actions.composePopoutDraft).toHaveBeenCalled();
  });

  it('shows and focuses cc when clicked', function() {
    makeField.call(this, { enabledFields: [Fields.To] });
    const el = ReactTestUtils.findRenderedDOMComponentWithClass(this.component, 'show-cc');
    ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(el));
    expect(this.onShowAndFocusField).toHaveBeenCalledWith(Fields.Cc);
  });

  it('shows and focuses bcc when clicked', function() {
    makeField.call(this, { enabledFields: [Fields.To] });
    const el = ReactTestUtils.findRenderedDOMComponentWithClass(this.component, 'show-bcc');
    ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(el));
    expect(this.onShowAndFocusField).toHaveBeenCalledWith(Fields.Bcc);
  });

  it('shows subject when clicked', function() {
    makeField.call(this, { enabledFields: [Fields.To] });
    const el = ReactTestUtils.findRenderedDOMComponentWithClass(this.component, 'show-subject');
    ReactTestUtils.Simulate.click(ReactDOM.findDOMNode(el));
    expect(this.onShowAndFocusField).toHaveBeenCalledWith(Fields.Subject);
  });
});
