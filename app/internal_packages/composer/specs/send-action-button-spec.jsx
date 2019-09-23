import React from 'react';
import { mount } from 'enzyme';
import { ButtonDropdown, RetinaImg } from 'mailspring-component-kit';
import { Actions, Message, SendActionsStore } from 'mailspring-exports';
import { SendActionButton } from '../lib/send-action-button';

const GoodSendAction = {
  title: 'Good Send Action',
  configKey: 'good-send-action',
  isAvailableForDraft: () => true,
  performSendAction: () => {},
};

const SecondSendAction = {
  title: 'Second Send Action',
  configKey: 'second-send-action',
  isAvailableForDraft: () => true,
  performSendAction: () => {},
};

const NoIconUrl = {
  title: 'No Icon',
  configKey: 'no-icon',
  iconUrl: null,
  isAvailableForDraft: () => true,
  performSendAction() {},
};

describe('SendActionButton', function describeBlock() {
  beforeEach(() => {
    spyOn(Actions, 'sendDraft');
    this.isValidDraft = jasmine.createSpy('isValidDraft');
    this.id = 'client-23';
    this.draft = new Message({ id: this.id, draft: true, headerMessageId: 'bla' });
  });

  const render = (draft, { isValid = true } = {}) => {
    this.isValidDraft.andReturn(isValid);
    return mount(<SendActionButton draft={draft} isValidDraft={this.isValidDraft} />);
  };

  it('renders without error', () => {
    const sendActionButton = render(this.draft);
    expect(sendActionButton.is(SendActionButton)).toBe(true);
  });

  it('is a dropdown', () => {
    spyOn(SendActionsStore, 'orderedSendActionsForDraft').andReturn([
      SendActionsStore.DefaultSendAction,
      GoodSendAction,
    ]);
    const sendActionButton = render(this.draft);
    const dropdowns = sendActionButton.find(ButtonDropdown);
    const buttons = sendActionButton.find('button');
    expect(buttons.length).toBe(0);
    expect(dropdowns.length).toBe(1);
    expect(dropdowns.first().prop('primaryTitle')).toBe('Send');
  });

  it('has the correct primary item', () => {
    spyOn(SendActionsStore, 'orderedSendActionsForDraft').andReturn([
      SecondSendAction,
      SendActionsStore.DefaultSendAction,
      GoodSendAction,
    ]);
    const sendActionButton = render(this.draft);
    const dropdown = sendActionButton.find(ButtonDropdown).first();
    expect(dropdown.prop('primaryTitle')).toBe('Second Send Action');
  });

  it("still renders with a null iconUrl and doesn't show the image", () => {
    spyOn(SendActionsStore, 'orderedSendActionsForDraft').andReturn([
      NoIconUrl,
      SendActionsStore.DefaultSendAction,
    ]);
    const sendActionButton = render(this.draft);
    const dropdowns = sendActionButton.find(ButtonDropdown);
    const buttons = sendActionButton.find('button');
    const icons = sendActionButton.find(RetinaImg);
    expect(buttons.length).toBe(0);
    expect(dropdowns.length).toBe(1);
    expect(icons.length).toBe(2);
  });

  it('sends a draft by default if no extra actions present', () => {
    spyOn(SendActionsStore, 'orderedSendActionsForDraft').andReturn([
      SendActionsStore.DefaultSendAction,
      GoodSendAction,
    ]);
    const sendActionButton = render(this.draft);
    const button = sendActionButton.find('button').first();
    button.simulate('click');
    expect(this.isValidDraft).toHaveBeenCalled();
    expect(Actions.sendDraft).toHaveBeenCalledWith(this.draft.headerMessageId, {
      actionKey: 'send',
    });
  });

  it("doesn't send a draft if the isValidDraft fails", () => {
    spyOn(SendActionsStore, 'orderedSendActionsForDraft').andReturn([
      SendActionsStore.DefaultSendAction,
      GoodSendAction,
    ]);
    const sendActionButton = render(this.draft, { isValid: false });
    const button = sendActionButton.find('button').first();
    button.simulate('click');
    expect(this.isValidDraft).toHaveBeenCalled();
    expect(Actions.sendDraft).not.toHaveBeenCalled();
  });

  it('does the preferred action when more than one action present', () => {
    spyOn(SendActionsStore, 'orderedSendActionsForDraft').andReturn([
      GoodSendAction,
      SendActionsStore.DefaultSendAction,
    ]);
    const sendActionButton = render(this.draft, {});
    const button = sendActionButton.find('.primary-item').first();
    button.simulate('click');
    expect(this.isValidDraft).toHaveBeenCalled();
    expect(Actions.sendDraft).toHaveBeenCalledWith(this.draft.headerMessageId, {
      actionKey: 'good-send-action',
    });
  });
});
