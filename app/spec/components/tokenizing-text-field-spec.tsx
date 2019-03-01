import React from 'react';
const { mount } = require('enzyme');

import { Contact } from 'mailspring-exports';;
import { KeyCommandsRegion, TokenizingTextField, Menu } from 'mailspring-component-kit';;

class CustomToken extends React.Component {
  render() {
    return <span>{this.props.token.email}</span>;
  }
}

class CustomSuggestion extends React.Component {
  render() {
    return <span>{this.props.item.email}</span>;
  }
}

const participant1 = new Contact({
  id: '1',
  email: 'ben@nylas.com',
});
const participant2 = new Contact({
  id: '2',
  email: 'burgers@nylas.com',
  name: 'Nylas Burger Basket',
});
const participant3 = new Contact({
  id: '3',
  email: 'evan@nylas.com',
  name: 'Evan',
});
const participant4 = new Contact({
  id: '4',
  email: 'tester@elsewhere.com',
  name: 'Tester',
});
const participant5 = new Contact({
  id: '5',
  email: 'michael@elsewhere.com',
  name: 'Michael',
});

describe('TokenizingTextField', function() {
  beforeEach(function() {
    this.completions = [];
    this.propAdd = jasmine.createSpy('add');
    this.propEdit = jasmine.createSpy('edit');
    this.propRemove = jasmine.createSpy('remove');
    this.propEmptied = jasmine.createSpy('emptied');
    this.propTokenKey = jasmine.createSpy('tokenKey').and.callFake(p => p.email);
    this.propTokenIsValid = jasmine.createSpy('tokenIsValid').andReturn(true);
    this.propTokenRenderer = CustomToken;
    this.propOnTokenAction = jasmine.createSpy('tokenAction');
    this.propCompletionNode = p => <CustomSuggestion item={p} />;
    this.propCompletionsForInput = input => this.completions;

    spyOn(this, 'propCompletionNode').andCallThrough();
    spyOn(this, 'propCompletionsForInput').andCallThrough();

    this.tokens = [participant1, participant2, participant3];

    this.rebuildRenderedField = (tokens = this.tokens) => {
      this.renderedField = mount(
        <TokenizingTextField
          tokens={this.tokens}
          tokenKey={this.propTokenKey}
          tokenRenderer={this.propTokenRenderer}
          tokenIsValid={this.propTokenIsValid}
          onRequestCompletions={this.propCompletionsForInput}
          completionNode={this.propCompletionNode}
          onAdd={this.propAdd}
          onEdit={this.propEdit}
          onRemove={this.propRemove}
          onEmptied={this.propEmptied}
          onTokenAction={this.propOnTokenAction}
          tabIndex={this.tabIndex}
        />
      );
      this.renderedInput = this.renderedField.find('input');
      return this.renderedField;
    };

    this.rebuildRenderedField();
  });

  it('renders into the document', function() {
    expect(this.renderedField.find(TokenizingTextField).length).toBe(1);
  });

  it('should render an input field', function() {
    expect(this.renderedInput).toBeDefined();
  });

  it('shows the tokens provided by the tokenRenderer', function() {
    expect(this.renderedField.find(CustomToken).length).toBe(this.tokens.length);
  });

  it('shows the tokens in the correct order', function() {
    this.renderedTokens = this.renderedField.find(CustomToken);
    __range__(0, this.tokens.length - 1, true).map(i =>
      expect(this.renderedTokens.at(i).props().token).toBe(this.tokens[i])
    );
  });

  describe('prop: tokenIsValid', function() {
    it("should be evaluated for each token when it's provided", function() {
      this.propTokenIsValid = jasmine.createSpy('tokenIsValid').and.callFake(p => {
        if (p === participant2) {
          return true;
        } else {
          return false;
        }
      });

      this.rebuildRenderedField();
      this.tokens = this.renderedField.find(TokenizingTextField.Token);
      expect(this.tokens.at(0).props().valid).toBe(false);
      expect(this.tokens.at(1).props().valid).toBe(true);
      expect(this.tokens.at(2).props().valid).toBe(false);
    });

    it('should default to true when not provided', function() {
      this.propTokenIsValid = null;
      this.rebuildRenderedField();
      this.tokens = this.renderedField.find(TokenizingTextField.Token);
      expect(this.tokens.at(0).props().valid).toBe(true);
      expect(this.tokens.at(1).props().valid).toBe(true);
      expect(this.tokens.at(2).props().valid).toBe(true);
    });
  });

  describe('when the user drags and drops a token between two fields', () =>
    it('should work properly', function() {
      const tokensA = [participant1, participant2, participant3];
      const fieldA = this.rebuildRenderedField(tokensA);

      const tokensB = [];
      const fieldB = this.rebuildRenderedField(tokensB);

      const tokenIndexToDrag = 1;
      const token = fieldA.find('.token').at(tokenIndexToDrag);

      const dragStartEventData = {};
      const dragStartEvent = {
        dataTransfer: {
          setData(type, val) {
            dragStartEventData[type] = val;
          },
        },
      };
      token.simulate('dragStart', dragStartEvent);

      expect(dragStartEventData).toEqual({
        'nylas-token-items':
          '[{"id":"2","name":"Nylas Burger Basket","email":"burgers@nylas.com","thirdPartyData":{},"__cls":"Contact"}]',
        'text/plain': 'Nylas Burger Basket <burgers@nylas.com>',
      });

      const dropEvent = {
        dataTransfer: {
          types: Object.keys(dragStartEventData),
          getData(type) {
            return dragStartEventData[type];
          },
        },
      };

      fieldB.find(KeyCommandsRegion).simulate('drop', dropEvent);

      expect(this.propAdd).toHaveBeenCalledWith([tokensA[tokenIndexToDrag]]);
    }));

  describe('When the user selects a token', function() {
    beforeEach(function() {
      const token = this.renderedField.find('.token').first();
      token.simulate('click');
    });

    it('should set the selectedKeys state', function() {
      expect(this.renderedField.state().selectedKeys).toEqual([participant1.email]);
    });

    it('should return the appropriate token object', function() {
      expect(this.propTokenKey).toHaveBeenCalledWith(participant1);
      expect(this.renderedField.find('.token.selected').length).toEqual(1);
    });
  });

  describe('when focused', () =>
    it('should receive the `focused` class', function() {
      expect(this.renderedField.find('.focused').length).toBe(0);
      this.renderedInput.simulate('focus');
      expect(this.renderedField.find('.focused').length).not.toBe(0);
    }));

  describe('when the user types in the input', function() {
    it('should fetch completions for the text', function() {
      this.renderedInput.simulate('change', { target: { value: 'abc' } });
      advanceClock(1000);
      expect(this.propCompletionsForInput.calls[0].args[0]).toBe('abc');
    });

    it('should fetch completions on focus', function() {
      this.renderedField.setState({ inputValue: 'abc' });
      this.renderedInput.simulate('focus');
      advanceClock(1000);
      expect(this.propCompletionsForInput.calls[0].args[0]).toBe('abc');
    });

    it('should display the completions', function() {
      this.completions = [participant4, participant5];
      this.renderedInput.simulate('change', { target: { value: 'abc' } });

      const components = this.renderedField.find(CustomSuggestion);
      expect(components.length).toBe(2);
      expect(components.at(0).props().item).toBe(participant4);
      expect(components.at(1).props().item).toBe(participant5);
    });

    it('should not display items with keys matching items already in the token field', function() {
      this.completions = [participant2, participant4, participant1];
      this.renderedInput.simulate('change', { target: { value: 'abc' } });

      const components = this.renderedField.find(CustomSuggestion);
      expect(components.length).toBe(1);
      expect(components.at(0).props().item).toBe(participant4);
    });

    it('should highlight the first completion', function() {
      this.completions = [participant4, participant5];
      this.renderedInput.simulate('change', { target: { value: 'abc' } });
      const components = this.renderedField.find(Menu.Item);
      const menuItem = components.first();
      expect(menuItem.props().selected).toBe(true);
    });

    it('select the clicked element', function() {
      this.completions = [participant4, participant5];
      this.renderedInput.simulate('change', { target: { value: 'abc' } });
      const components = this.renderedField.find(Menu.Item);
      const menuItem = components.first();
      menuItem.simulate('mouseDown');
      expect(this.propAdd).toHaveBeenCalledWith([participant4]);
    });

    it("doesn't sumbmit if it looks like an email but has no space at the end", function() {
      this.renderedInput.simulate('change', { target: { value: 'abc@foo.com' } });
      advanceClock(10);
      expect(this.propCompletionsForInput.calls[0].args[0]).toBe('abc@foo.com');
      expect(this.propAdd).not.toHaveBeenCalled();
    });

    it("allows spaces if what's currently being entered doesn't look like an email", function() {
      this.renderedInput.simulate('change', { target: { value: 'ab' } });
      advanceClock(10);
      this.renderedInput.simulate('change', { target: { value: 'ab ' } });
      advanceClock(10);
      this.renderedInput.simulate('change', { target: { value: 'ab c' } });
      advanceClock(10);
      expect(this.propCompletionsForInput.calls[2].args[0]).toBe('ab c');
      expect(this.propAdd).not.toHaveBeenCalled();
    });
  });

  [{ key: 'Enter', keyCode: 13 }, { key: ',', keyCode: 188 }].forEach(({ key, keyCode }) =>
    describe(`when the user presses ${key}`, function() {
      describe('and there is an completion available', () =>
        it('should call add with the first completion', function() {
          this.completions = [participant4];
          this.renderedInput.simulate('change', { target: { value: 'abc' } });
          this.renderedInput.simulate('keyDown', { key, keyCode });
          expect(this.propAdd).toHaveBeenCalledWith([participant4]);
        }));

      describe('and there is NO completion available', () =>
        it('should call add, allowing the parent to (optionally) turn the text into a token', function() {
          this.completions = [];
          this.renderedInput.simulate('change', { target: { value: 'abc' } });
          this.renderedInput.simulate('keyDown', { key, keyCode });
          expect(this.propAdd).toHaveBeenCalledWith('abc', {});
        }));
    })
  );

  describe('when the user presses tab', function() {
    beforeEach(function() {
      this.tabDownEvent = {
        key: 'Tab',
        keyCode: 9,
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation'),
      };
    });

    describe('and there is an completion available', () =>
      it('should call add with the first completion', function() {
        this.completions = [participant4];
        this.renderedInput.simulate('change', { target: { value: 'abc' } });
        this.renderedInput.simulate('keyDown', this.tabDownEvent);
        expect(this.propAdd).toHaveBeenCalledWith([participant4]);
        expect(this.tabDownEvent.preventDefault).toHaveBeenCalled();
        expect(this.tabDownEvent.stopPropagation).toHaveBeenCalled();
      }));

    it("shouldn't handle the event in the input is empty", function() {
      // We ignore on empty input values
      this.renderedInput.simulate('change', { target: { value: ' ' } });
      this.renderedInput.simulate('keyDown', this.tabDownEvent);
      expect(this.propAdd).not.toHaveBeenCalled();
    });

    it('should NOT stop the propagation if the input is empty.', function() {
      // This is to allow tabs to propagate up to controls that might want
      // to change the focus later.
      this.renderedInput.simulate('change', { target: { value: ' ' } });
      this.renderedInput.simulate('keyDown', this.tabDownEvent);
      expect(this.propAdd).not.toHaveBeenCalled();
      expect(this.tabDownEvent.stopPropagation).not.toHaveBeenCalled();
    });

    it('should add the raw input value if there are no completions', function() {
      this.completions = [];
      this.renderedInput.simulate('change', { target: { value: 'abc' } });
      this.renderedInput.simulate('keyDown', this.tabDownEvent);
      expect(this.propAdd).toHaveBeenCalledWith('abc', {});
      expect(this.tabDownEvent.preventDefault).toHaveBeenCalled();
      expect(this.tabDownEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('when blurred', function() {
    it('should do nothing if the relatedTarget is null meaning the app has been blurred', function() {
      this.renderedInput.simulate('focus');
      this.renderedInput.simulate('change', { target: { value: 'text' } });
      this.renderedInput.simulate('blur', { relatedTarget: null });
      expect(this.propAdd).not.toHaveBeenCalled();
      expect(this.renderedField.find('.focused').length).not.toBe(0);
    });

    it('should call add, allowing the parent component to (optionally) turn the entered text into a token', function() {
      this.renderedInput.simulate('focus');
      this.renderedInput.simulate('change', { target: { value: 'text' } });
      this.renderedInput.simulate('blur', { relatedTarget: document.body });
      expect(this.propAdd).toHaveBeenCalledWith('text', {});
    });

    it('should clear the entered text', function() {
      this.renderedInput.simulate('focus');
      this.renderedInput.simulate('change', { target: { value: 'text' } });
      this.renderedInput.simulate('blur', { relatedTarget: document.body });
      expect(this.renderedInput.props().value).toBe('');
    });

    it('should no longer have the `focused` class', function() {
      this.renderedInput.simulate('focus');
      expect(this.renderedField.find('.focused').length).not.toBe(0);
      this.renderedInput.simulate('blur', { relatedTarget: document.body });
      expect(this.renderedField.find('.focused').length).toBe(0);
    });
  });

  describe('cut', () =>
    it('removes the selected tokens', function() {
      this.renderedField.setState({ selectedKeys: [participant1.email] });
      this.renderedInput.simulate('cut');
      expect(this.propRemove).toHaveBeenCalledWith([participant1]);
      expect(this.renderedField.find('.token.selected').length).toEqual(0);
      expect(this.propEmptied).not.toHaveBeenCalled();
    }));

  describe('backspace', function() {
    describe('when no token is selected', () =>
      it("selects the last token first and doesn't remove", function() {
        this.renderedInput.simulate('keyDown', { key: 'Backspace', keyCode: 8 });
        expect(this.renderedField.find('.token.selected').length).toEqual(1);
        expect(this.propRemove).not.toHaveBeenCalled();
        expect(this.propEmptied).not.toHaveBeenCalled();
      }));

    describe('when a token is selected', () =>
      it('removes that token and deselects', function() {
        this.renderedField.setState({ selectedKeys: [participant1.email] });
        expect(this.renderedField.find('.token.selected').length).toEqual(1);
        this.renderedInput.simulate('keyDown', { key: 'Backspace', keyCode: 8 });
        expect(this.propRemove).toHaveBeenCalledWith([participant1]);
        expect(this.renderedField.find('.token.selected').length).toEqual(0);
        expect(this.propEmptied).not.toHaveBeenCalled();
      }));

    describe('when there are no tokens left', () =>
      it('fires onEmptied', function() {
        this.renderedField.setProps({ tokens: [] });
        expect(this.renderedField.find('.token').length).toEqual(0);
        this.renderedInput.simulate('keyDown', { key: 'Backspace', keyCode: 8 });
        expect(this.propEmptied).toHaveBeenCalled();
      }));
  });
});

describe('TokenizingTextField.Token', function() {
  describe('when an onEdit prop has been provided', function() {
    beforeEach(function() {
      this.propEdit = jasmine.createSpy('onEdit');
      this.propClick = jasmine.createSpy('onClick');
      this.token = mount(
        React.createElement(TokenizingTextField.Token, {
          selected: false,
          valid: true,
          item: participant1,
          onClick: this.propClick,
          onEdited: this.propEdit,
          onDragStart: jasmine.createSpy('onDragStart'),
        })
      );
    });

    it('should enter editing mode', function() {
      expect(this.token.state().editing).toBe(false);
      this.token.simulate('doubleClick', {});
      expect(this.token.state().editing).toBe(true);
    });

    it('should call onEdit to commit the new token value when the edit field is blurred', function() {
      expect(this.token.state().editing).toBe(false);
      this.token.simulate('doubleClick', {});
      const tokenEditInput = this.token.find('input');
      tokenEditInput.simulate('change', { target: { value: 'new tag content' } });
      tokenEditInput.simulate('blur');
      expect(this.propEdit).toHaveBeenCalledWith(participant1, 'new tag content');
    });
  });

  describe('when no onEdit prop has been provided', () =>
    it('should not enter editing mode', function() {
      this.token = mount(
        React.createElement(TokenizingTextField.Token, {
          selected: false,
          valid: true,
          item: participant1,
          onClick: jasmine.createSpy('onClick'),
          onDragStart: jasmine.createSpy('onDragStart'),
          onEdited: null,
        })
      );
      expect(this.token.state().editing).toBe(false);
      this.token.simulate('doubleClick', {});
      expect(this.token.state().editing).toBe(false);
    }));
});

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
