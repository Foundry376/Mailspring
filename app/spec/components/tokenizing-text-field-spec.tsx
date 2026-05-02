import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { Contact } from 'mailspring-exports';
import { KeyCommandsRegion, TokenizingTextField, Menu } from 'mailspring-component-kit';

class CustomToken extends React.Component<{ token: any }> {
  render() {
    return <span>{this.props.token.email}</span>;
  }
}

class CustomSuggestion extends React.Component<{ item: any }> {
  render() {
    return <span>{this.props.item.email}</span>;
  }
}

const participant1 = new Contact({
  id: '1',
  email: 'ben@mailspring.com',
});
const participant2 = new Contact({
  id: '2',
  email: 'burgers@mailspring.com',
  name: 'Mailspring Burger Basket',
  hidden: false,
  source: 'mail',
});
const participant3 = new Contact({
  id: '3',
  email: 'evan@mailspring.com',
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

describe('TokenizingTextField', function () {
  afterEach(cleanup);

  beforeEach(function () {
    this.completions = [];
    this.propAdd = jasmine.createSpy('add');
    this.propEdit = jasmine.createSpy('edit');
    this.propRemove = jasmine.createSpy('remove');
    this.propEmptied = jasmine.createSpy('emptied');
    this.propTokenKey = jasmine.createSpy('tokenKey').andCallFake((p) => p.email);
    this.propTokenIsValid = jasmine.createSpy('tokenIsValid').andReturn(true);
    this.propTokenRenderer = CustomToken;
    this.propOnTokenAction = jasmine.createSpy('tokenAction');
    this.propCompletionNode = (p) => <CustomSuggestion item={p} />;
    this.propCompletionsForInput = (input) => this.completions;

    spyOn(this, 'propCompletionNode').andCallThrough();
    spyOn(this, 'propCompletionsForInput').andCallThrough();

    this.tokens = [participant1, participant2, participant3];

    this.rebuildRenderedField = (tokens = this.tokens) => {
      const result = render(
        <TokenizingTextField
          tokens={tokens}
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
      this.container = result.container;
      this.rerender = result.rerender;
      this.renderedInput = this.container.querySelector('input');
      return result;
    };

    this.rebuildRenderedField();
  });

  it('renders into the document', function () {
    expect(this.container.querySelector('.tokenizing-field')).not.toBe(null);
  });

  it('should render an input field', function () {
    expect(this.renderedInput).not.toBe(null);
  });

  it('shows the tokens provided by the tokenRenderer', function () {
    // Each token renders a CustomToken wrapped in a .token div
    expect(this.container.querySelectorAll('.token').length).toBe(this.tokens.length);
  });

  it('shows the tokens in the correct order', function () {
    const tokenEls = this.container.querySelectorAll('.token');
    const expectedEmails = this.tokens.map((t) => t.email);
    __range__(0, this.tokens.length - 1, true).map((i) =>
      expect(tokenEls[i].textContent).toContain(expectedEmails[i])
    );
  });

  describe('prop: tokenIsValid', function () {
    it("should be evaluated for each token when it's provided", function () {
      this.propTokenIsValid = jasmine.createSpy('tokenIsValid').andCallFake((p) => {
        if (p === participant2) {
          return true;
        } else {
          return false;
        }
      });

      this.rebuildRenderedField();
      const tokenEls = this.container.querySelectorAll('.token');
      // participant1 -> invalid, participant2 -> valid, participant3 -> invalid
      expect(tokenEls[0].classList.contains('invalid')).toBe(true);
      expect(tokenEls[1].classList.contains('invalid')).toBe(false);
      expect(tokenEls[2].classList.contains('invalid')).toBe(true);
    });

    it('should default to true when not provided', function () {
      this.propTokenIsValid = null;
      this.rebuildRenderedField();
      const tokenEls = this.container.querySelectorAll('.token');
      expect(tokenEls[0].classList.contains('invalid')).toBe(false);
      expect(tokenEls[1].classList.contains('invalid')).toBe(false);
      expect(tokenEls[2].classList.contains('invalid')).toBe(false);
    });
  });

  describe('when the user drags and drops a token between two fields', () =>
    it('should work properly', function () {
      const tokensA = [participant1, participant2, participant3];
      const resultA = render(
        <TokenizingTextField
          tokens={tokensA}
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
        />
      );
      const containerA = resultA.container;

      const tokensB = [];
      const resultB = render(
        <TokenizingTextField
          tokens={tokensB}
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
        />
      );
      const containerB = resultB.container;

      const tokenIndexToDrag = 1;
      const tokenEl = containerA.querySelectorAll('.token')[tokenIndexToDrag];

      const dragStartEventData = {};
      const dragStartDataTransfer = {
        setData(type, val) {
          dragStartEventData[type] = val;
        },
      };

      // Chromium doesn't allow setting dataTransfer via DragEventInit, so use a
      // plain Event with dataTransfer injected via Object.defineProperty.
      const dragStartEvt = new Event('dragstart', { bubbles: true });
      Object.defineProperty(dragStartEvt, 'dataTransfer', { value: dragStartDataTransfer });
      tokenEl.dispatchEvent(dragStartEvt);

      expect(dragStartEventData).toEqual({
        'mailspring-token-items':
          '[{"id":"2","name":"Mailspring Burger Basket","h":false,"s":"mail","email":"burgers@mailspring.com","gis":[],"__cls":"Contact"}]',
        'text/plain': 'Mailspring Burger Basket <burgers@mailspring.com>',
      });

      const dropDataTransfer = {
        types: Object.keys(dragStartEventData),
        getData(type) {
          return dragStartEventData[type];
        },
      };

      const dropTarget = containerB.querySelector('.tokenizing-field-wrap');
      const dropEvt = new Event('drop', { bubbles: true });
      Object.defineProperty(dropEvt, 'dataTransfer', { value: dropDataTransfer });
      dropTarget.dispatchEvent(dropEvt);

      expect(this.propAdd).toHaveBeenCalledWith([tokensA[tokenIndexToDrag]]);
    }));

  describe('When the user selects a token', function () {
    beforeEach(function () {
      const token = this.container.querySelector('.token');
      fireEvent.click(token);
    });

    it('should set the selectedKeys state', function () {
      // selectedKeys state is reflected via .selected CSS class on the token
      expect(this.container.querySelectorAll('.token.selected').length).toEqual(1);
      expect(this.container.querySelector('.token.selected').textContent).toContain(
        participant1.email
      );
    });

    it('should return the appropriate token object', function () {
      expect(this.propTokenKey).toHaveBeenCalledWith(participant1);
      expect(this.container.querySelectorAll('.token.selected').length).toEqual(1);
    });
  });

  describe('when focused', () =>
    it('should receive the `focused` class', function () {
      expect(this.container.querySelectorAll('.focused').length).toBe(0);
      fireEvent.focus(this.renderedInput);
      expect(this.container.querySelectorAll('.focused').length).not.toBe(0);
    }));

  describe('when the user types in the input', function () {
    it('should fetch completions for the text', function () {
      fireEvent.change(this.renderedInput, { target: { value: 'abc' } });
      advanceClock(1000);
      expect(this.propCompletionsForInput.calls[0].args[0]).toBe('abc');
    });

    it('should fetch completions on focus', function () {
      // Set input value first so the field has a value, then trigger focus
      fireEvent.change(this.renderedInput, { target: { value: 'abc' } });
      fireEvent.focus(this.renderedInput);
      advanceClock(1000);
      expect(this.propCompletionsForInput.calls[0].args[0]).toBe('abc');
    });

    it('should display the completions', function () {
      this.completions = [participant4, participant5];
      fireEvent.change(this.renderedInput, { target: { value: 'abc' } });

      // Menu.Item renders as <div class="item [selected]"> containing CustomSuggestion
      const items = this.container.querySelectorAll('.item:not(.divider)');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain(participant4.email);
      expect(items[1].textContent).toContain(participant5.email);
    });

    it('should not display items with keys matching items already in the token field', function () {
      this.completions = [participant2, participant4, participant1];
      fireEvent.change(this.renderedInput, { target: { value: 'abc' } });

      const items = this.container.querySelectorAll('.item:not(.divider)');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain(participant4.email);
    });

    it('should highlight the first completion', function () {
      this.completions = [participant4, participant5];
      fireEvent.change(this.renderedInput, { target: { value: 'abc' } });
      const items = this.container.querySelectorAll('.item:not(.divider)');
      // The first item should have the 'selected' class
      expect(items[0].classList.contains('selected')).toBe(true);
    });

    it('select the clicked element', function () {
      this.completions = [participant4, participant5];
      fireEvent.change(this.renderedInput, { target: { value: 'abc' } });
      const firstItem = this.container.querySelector('.item:not(.divider)');
      fireEvent.mouseDown(firstItem);
      expect(this.propAdd).toHaveBeenCalledWith([participant4]);
    });

    it("doesn't sumbmit if it looks like an email but has no space at the end", function () {
      fireEvent.change(this.renderedInput, { target: { value: 'abc@foo.com' } });
      advanceClock(10);
      expect(this.propCompletionsForInput.calls[0].args[0]).toBe('abc@foo.com');
      expect(this.propAdd).not.toHaveBeenCalled();
    });

    it("allows spaces if what's currently being entered doesn't look like an email", function () {
      fireEvent.change(this.renderedInput, { target: { value: 'ab' } });
      advanceClock(10);
      fireEvent.change(this.renderedInput, { target: { value: 'ab ' } });
      advanceClock(10);
      fireEvent.change(this.renderedInput, { target: { value: 'ab c' } });
      advanceClock(10);
      expect(this.propCompletionsForInput.calls[2].args[0]).toBe('ab c');
      expect(this.propAdd).not.toHaveBeenCalled();
    });
  });

  [
    { key: 'Enter', keyCode: 13 },
    { key: ',', keyCode: 188 },
  ].forEach(({ key, keyCode }) =>
    describe(`when the user presses ${key}`, function () {
      describe('and there is an completion available', () =>
        it('should call add with the first completion', function () {
          this.completions = [participant4];
          fireEvent.change(this.renderedInput, { target: { value: 'abc' } });
          fireEvent.keyDown(this.renderedInput, { key, keyCode });
          expect(this.propAdd).toHaveBeenCalledWith([participant4]);
        }));

      describe('and there is NO completion available', () =>
        it('should call add, allowing the parent to (optionally) turn the text into a token', function () {
          this.completions = [];
          fireEvent.change(this.renderedInput, { target: { value: 'abc' } });
          fireEvent.keyDown(this.renderedInput, { key, keyCode });
          expect(this.propAdd).toHaveBeenCalledWith('abc', {});
        }));
    })
  );

  describe('when the user presses tab', function () {
    // Note: fireEvent creates real DOM events; we cannot inject spy functions
    // for preventDefault/stopPropagation. We test observable behavior instead.

    describe('and there is an completion available', () =>
      it('should call add with the first completion', function () {
        this.completions = [participant4];
        fireEvent.change(this.renderedInput, { target: { value: 'abc' } });
        fireEvent.keyDown(this.renderedInput, { key: 'Tab', keyCode: 9 });
        expect(this.propAdd).toHaveBeenCalledWith([participant4]);
      }));

    it("shouldn't handle the event in the input is empty", function () {
      // We ignore on empty input values
      fireEvent.change(this.renderedInput, { target: { value: ' ' } });
      fireEvent.keyDown(this.renderedInput, { key: 'Tab', keyCode: 9 });
      expect(this.propAdd).not.toHaveBeenCalled();
    });

    it('should NOT stop the propagation if the input is empty.', function () {
      // This is to allow tabs to propagate up to controls that might want
      // to change the focus later.
      fireEvent.change(this.renderedInput, { target: { value: ' ' } });
      fireEvent.keyDown(this.renderedInput, { key: 'Tab', keyCode: 9 });
      expect(this.propAdd).not.toHaveBeenCalled();
    });

    it('should add the raw input value if there are no completions', function () {
      this.completions = [];
      fireEvent.change(this.renderedInput, { target: { value: 'abc' } });
      fireEvent.keyDown(this.renderedInput, { key: 'Tab', keyCode: 9 });
      expect(this.propAdd).toHaveBeenCalledWith('abc', {});
    });
  });

  describe('when blurred', function () {
    it('should do nothing if the relatedTarget is null meaning the app has been blurred', function () {
      fireEvent.focus(this.renderedInput);
      fireEvent.change(this.renderedInput, { target: { value: 'text' } });
      fireEvent.blur(this.renderedInput, { relatedTarget: null });
      expect(this.propAdd).not.toHaveBeenCalled();
      expect(this.container.querySelectorAll('.focused').length).not.toBe(0);
    });

    it('should call add, allowing the parent component to (optionally) turn the entered text into a token', function () {
      fireEvent.focus(this.renderedInput);
      fireEvent.change(this.renderedInput, { target: { value: 'text' } });
      fireEvent.blur(this.renderedInput, { relatedTarget: document.body });
      expect(this.propAdd).toHaveBeenCalledWith('text', {});
    });

    it('should clear the entered text', function () {
      fireEvent.focus(this.renderedInput);
      fireEvent.change(this.renderedInput, { target: { value: 'text' } });
      fireEvent.blur(this.renderedInput, { relatedTarget: document.body });
      expect(this.renderedInput.value).toBe('');
    });

    it('should no longer have the `focused` class', function () {
      fireEvent.focus(this.renderedInput);
      expect(this.container.querySelectorAll('.tokenizing-field.focused').length).not.toBe(0);
      fireEvent.blur(this.renderedInput, { relatedTarget: document.body });
      expect(this.container.querySelectorAll('.tokenizing-field.focused').length).toBe(0);
    });
  });

  describe('cut', () =>
    it('removes the selected tokens', function () {
      // Select participant1 by clicking its token
      const firstToken = this.container.querySelector('.token');
      fireEvent.click(firstToken);
      expect(this.container.querySelectorAll('.token.selected').length).toEqual(1);
      fireEvent.cut(this.renderedInput);
      expect(this.propRemove).toHaveBeenCalledWith([participant1]);
      expect(this.container.querySelectorAll('.token.selected').length).toEqual(0);
      expect(this.propEmptied).not.toHaveBeenCalled();
    }));

  describe('backspace', function () {
    describe('when no token is selected', () =>
      it("selects the last token first and doesn't remove", function () {
        fireEvent.keyDown(this.renderedInput, { key: 'Backspace', keyCode: 8 });
        expect(this.container.querySelectorAll('.token.selected').length).toEqual(1);
        expect(this.propRemove).not.toHaveBeenCalled();
        expect(this.propEmptied).not.toHaveBeenCalled();
      }));

    describe('when a token is selected', () =>
      it('removes that token and deselects', function () {
        // Select participant1 by clicking its token
        const firstToken = this.container.querySelector('.token');
        fireEvent.click(firstToken);
        expect(this.container.querySelectorAll('.token.selected').length).toEqual(1);
        fireEvent.keyDown(this.renderedInput, { key: 'Backspace', keyCode: 8 });
        expect(this.propRemove).toHaveBeenCalledWith([participant1]);
        expect(this.container.querySelectorAll('.token.selected').length).toEqual(0);
        expect(this.propEmptied).not.toHaveBeenCalled();
      }));

    describe('when there are no tokens left', () =>
      it('fires onEmptied', function () {
        this.rerender(
          <TokenizingTextField
            tokens={[]}
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
        expect(this.container.querySelectorAll('.token').length).toEqual(0);
        fireEvent.keyDown(this.renderedInput, { key: 'Backspace', keyCode: 8 });
        expect(this.propEmptied).toHaveBeenCalled();
      }));
  });
});

describe('TokenizingTextField.Token', function () {
  afterEach(cleanup);

  describe('when an onEdit prop has been provided', function () {
    beforeEach(function () {
      this.propEdit = jasmine.createSpy('onEdit');
      this.propClick = jasmine.createSpy('onClick');
      const result = render(
        <TokenizingTextField.Token
          selected={false}
          valid={true}
          item={participant1}
          onClick={this.propClick}
          onEdited={this.propEdit}
          onDragStart={jasmine.createSpy('onDragStart')}
          onAction={jasmine.createSpy('onAction')}
        />
      );
      this.container = result.container;
    });

    it('should enter editing mode when double-clicked', function () {
      // Not editing: the token renders its children, no input visible in the token area
      expect(this.container.querySelector('.token')).not.toBe(null);
      expect(this.container.querySelector('input')).toBe(null);
      fireEvent.dblClick(this.container.querySelector('.token'));
      // After double-click, token switches to editing mode which renders a SizeToFitInput
      expect(this.container.querySelector('input')).not.toBe(null);
    });

    it('should call onEdited when blurred while editing', function () {
      // Not editing: no input visible
      expect(this.container.querySelector('input')).toBe(null);
      fireEvent.dblClick(this.container.querySelector('.token'));
      // Now editing: input should be present
      expect(this.container.querySelector('input')).not.toBe(null);
      const tokenEditInput = this.container.querySelector('input');
      fireEvent.change(tokenEditInput, { target: { value: 'new tag content' } });
      fireEvent.blur(tokenEditInput);
      expect(this.propEdit).toHaveBeenCalledWith(participant1, 'new tag content');
    });
  });

  describe('when no onEdit prop has been provided', () =>
    it('should not enter editing mode', function () {
      const result = render(
        React.createElement(TokenizingTextField.Token, {
          selected: false,
          valid: true,
          item: participant1,
          className: '',
          onClick: jasmine.createSpy('onClick'),
          onDragStart: jasmine.createSpy('onDragStart'),
          onEdited: null,
          onAction: jasmine.createSpy('onAction'),
        })
      );
      const container = result.container;
      // Not editing: no input present
      expect(container.querySelector('input')).toBe(null);
      fireEvent.dblClick(container.querySelector('.token'));
      // Still not editing since onEdited is null
      expect(container.querySelector('input')).toBe(null);
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
