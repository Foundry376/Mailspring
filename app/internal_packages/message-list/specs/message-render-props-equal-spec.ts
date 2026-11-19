import { Message, Utils } from 'mailspring-exports';
import { messageRenderPropsEqual } from '../lib/message-render-props-equal';

describe('messageRenderPropsEqual', () => {
  const thread = { id: 't1' };
  const messagesA = [
    new Message({ id: 'm1', subject: 'One' }),
    new Message({ id: 'm2', subject: 'Two' }),
  ];
  const messagesB = [
    new Message({ id: 'm1', subject: 'One' }),
    new Message({ id: 'm2', subject: 'Two' }),
  ];
  const messagesC = [
    new Message({ id: 'm1', subject: 'One' }),
    new Message({ id: 'm2', subject: 'Changed' }),
  ];

  it('compares the other props as before', () => {
    expect(
      messageRenderPropsEqual(
        { thread, collapsed: true, messages: messagesA },
        { thread, collapsed: true, messages: messagesA }
      )
    ).toBe(true);
    expect(
      messageRenderPropsEqual(
        { thread, collapsed: false, messages: messagesA },
        { thread, collapsed: true, messages: messagesA }
      )
    ).toBe(false);
  });

  it('deep-compares two message lists once, however many rows ask', () => {
    spyOn(Utils, 'isEqualReact').andCallThrough();
    for (let row = 0; row < 5; row++) {
      expect(
        messageRenderPropsEqual({ thread, messages: messagesB }, { thread, messages: messagesA })
      ).toBe(true);
    }
    const listComparisons = (Utils.isEqualReact as any).argsForCall.filter(([a]) =>
      Array.isArray(a)
    );
    expect(listComparisons.length).toBe(1);
  });

  it('reports a changed message list', () => {
    expect(
      messageRenderPropsEqual({ thread, messages: messagesC }, { thread, messages: messagesA })
    ).toBe(false);
  });
});
