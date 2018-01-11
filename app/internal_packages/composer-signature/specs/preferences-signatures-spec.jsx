/* eslint quote-props: 0 */
import ReactTestUtils from 'react-dom/test-utils';
import React from 'react';
import { SignatureStore, Actions } from 'mailspring-exports';
import PreferencesSignatures from '../lib/preferences-signatures';

const SIGNATURES = {
  '1': {
    id: '1',
    title: 'one',
    body: 'first test signature!',
  },
  '2': {
    id: '2',
    title: 'two',
    body: 'Here is my second sig!',
  },
};

const DEFAULTS = {
  'one@nylas.com': '1',
  'two@nylas.com': '2',
};

const makeComponent = (props = {}) => {
  return ReactTestUtils.renderIntoDocument(<PreferencesSignatures {...props} />);
};

describe('PreferencesSignatures', function preferencesSignatures() {
  this.component = null;

  describe('when there are signatures', () => {
    beforeEach(() => {
      spyOn(SignatureStore, 'getSignatures').andReturn(SIGNATURES);
      spyOn(SignatureStore, 'selectedSignature').andReturn(SIGNATURES['1']);
      spyOn(SignatureStore, 'getDefaults').andReturn(DEFAULTS);
      this.component = makeComponent();
    });
    it('should add a signature when you click the plus button', () => {
      spyOn(Actions, 'upsertSignature');
      this.plus = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.component,
        'btn-editable-list'
      )[0];
      ReactTestUtils.Simulate.click(this.plus);
      expect(Actions.upsertSignature).toHaveBeenCalled();
    });
    it('should delete a signature when you click the minus button', () => {
      spyOn(Actions, 'removeSignature');
      this.minus = ReactTestUtils.scryRenderedDOMComponentsWithClass(
        this.component,
        'btn-editable-list'
      )[1];
      ReactTestUtils.Simulate.click(this.minus);
      expect(Actions.removeSignature).toHaveBeenCalledWith(SIGNATURES['1']);
    });
    it('should set the selected signature when you click on one that is not currently selected', () => {
      spyOn(Actions, 'selectSignature');
      this.item = ReactTestUtils.scryRenderedDOMComponentsWithClass(this.component, 'list-item')[1];
      ReactTestUtils.Simulate.click(this.item);
      expect(Actions.selectSignature).toHaveBeenCalledWith('2');
    });
    it('should modify the signature title when edited', () => {
      spyOn(Actions, 'upsertSignature');
      const newTitle = 'Changed';
      this.component._onEditSignatureTitle(newTitle);
      expect(Actions.upsertSignature).toHaveBeenCalled();
    });
  });
});
