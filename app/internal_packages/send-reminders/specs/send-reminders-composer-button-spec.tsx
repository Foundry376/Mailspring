import React from 'react';
import ReactDOM from 'react-dom';
import { FeatureUsageStore, Message } from 'mailspring-exports';

import SendRemindersComposerButton from '../lib/send-reminders-composer-button';
import { THREAD_PLUGIN_ID } from '../lib/send-reminders-constants';

const REMINDER = new Date('2026-09-20T12:00:00Z');

function draftWithReminder(expiration: Date | null) {
  const draft = new Message({ headerMessageId: 'h1', accountId: 'a1', draft: true });
  if (expiration) {
    draft.directlyAttachMetadata(THREAD_PLUGIN_ID, { expiration });
  }
  return draft;
}

function render(node: HTMLElement, draft: Message, session: any) {
  return ReactDOM.render(
    <SendRemindersComposerButton draft={draft} session={session} />,
    node
  ) as unknown as SendRemindersComposerButton;
}

// updateDraftReminderMetadata awaits a feature-usage check; timers are frozen in specs.
async function drain() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('SendRemindersComposerButton', function sendRemindersComposerButton() {
  let node: HTMLElement;
  let session: any;

  beforeEach(() => {
    node = document.createElement('div');
    session = {
      draft: () => draftWithReminder(REMINDER),
      changes: { add: jasmine.createSpy('add'), addPluginMetadata: jasmine.createSpy('meta') },
    };
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(node);
  });

  it('shows a spinner while the first reminder on a draft saves', async () => {
    session.draft = () => draftWithReminder(null);
    spyOn(FeatureUsageStore, 'markUsedOrUpgrade').andReturn(Promise.resolve());
    const button = render(node, draftWithReminder(null), session);
    const saved = button.onSetReminder(REMINDER);
    expect(node.querySelector('.btn-send-reminder .loading-spinner')).not.toBe(null);
    await saved;
  });

  it('stops the spinner when the reminder is set to the date it already has', async () => {
    const button = render(node, draftWithReminder(REMINDER), session);
    await button.onSetReminder(REMINDER);
    await drain();
    expect(node.querySelector('.loading-spinner')).toBe(null);
  });

  it('stops the spinner when the upgrade prompt is declined', async () => {
    session.draft = () => draftWithReminder(null);
    spyOn(FeatureUsageStore, 'markUsedOrUpgrade').andCallFake(() =>
      Promise.reject(new FeatureUsageStore.NoProAccessError('declined'))
    );
    const button = render(node, draftWithReminder(null), session);
    await button.onSetReminder(REMINDER);
    await drain();
    expect(session.changes.addPluginMetadata).not.toHaveBeenCalled();
    expect(node.querySelector('.loading-spinner')).toBe(null);
  });
});
