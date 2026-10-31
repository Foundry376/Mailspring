import NativeNotifications from '../src/native-notifications';

describe('NativeNotifications Windows toast XML', () => {
  it('silences individual notification toasts so SoundRegistry controls audio', () => {
    const xml = (NativeNotifications as any).buildWindowsToastXml({
      id: 'notification-id',
      title: 'New message',
      threadId: 'thread-id',
    });

    expect(xml).toContain('<audio silent="true"/>');
  });

  it('silences summary toasts so SoundRegistry controls audio', () => {
    const xml = (NativeNotifications as any).buildWindowsSummaryToastXml(
      'notification-id',
      5,
      ['Ada', 'Grace']
    );

    expect(xml).toContain('<audio silent="true"/>');
  });
});
