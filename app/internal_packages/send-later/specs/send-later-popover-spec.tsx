import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import SendLaterPopover from '../lib/send-later-popover';

const makePopover = (props = {}) => {
  const { container } = render(
    <SendLaterPopover
      sendLaterDate={null}
      onSendLater={() => {}}
      onAssignSendLaterDate={() => {}}
      onCancelSendLater={() => {}}
      {...props}
    />
  );
  return container;
};

describe('SendLaterPopover', function sendLaterPopover() {
  afterEach(cleanup);

  describe('render', () => {
    it('renders cancel button if scheduled', () => {
      const onCancelSendLater = jasmine.createSpy('onCancelSendLater');
      const container = makePopover({ onCancelSendLater, sendLaterDate: new Date() });
      fireEvent.click(container.querySelector('.btn-cancel'));
      expect(onCancelSendLater).toHaveBeenCalled();
    });
  });
});
