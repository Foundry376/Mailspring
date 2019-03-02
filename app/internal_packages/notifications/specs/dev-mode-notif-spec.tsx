import { mount } from 'enzyme';
import React from 'react';
import DevModeNotification from '../lib/items/dev-mode-notif';

describe('DevModeNotif', function DevModeNotifTests() {
  describe('When the window is in dev mode', () => {
    beforeEach(() => {
      spyOn(AppEnv, 'inDevMode').and.returnValue(true);
      this.notif = mount(<DevModeNotification />);
    });
    it('displays a notification', () => {
      expect(this.notif.find('.notification').exists()).toEqual(true);
    });
  });

  describe('When the window is not in dev mode', () => {
    beforeEach(() => {
      spyOn(AppEnv, 'inDevMode').and.returnValue(false);
      this.notif = mount(<DevModeNotification />);
    });
    it("doesn't display a notification", () => {
      expect(this.notif.find('.notification').exists()).toEqual(false);
    });
  });
});
