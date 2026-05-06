import { render, fireEvent, cleanup } from '@testing-library/react';
import proxyquire from 'proxyquire';
import React from 'react';

let stubIsRegistered = null;
let stubRegister = () => {};
const patched = proxyquire('../lib/items/default-client-notif', {
  'mailspring-exports': {
    DefaultClientHelper: class {
      constructor() {
        this.isRegisteredForURLScheme = (urlScheme, callback) => {
          callback(stubIsRegistered);
        };
        this.registerForURLScheme = urlScheme => {
          stubRegister(urlScheme);
        };
      }
    },
  },
});
const DefaultClientNotification = patched.default;
const SETTINGS_KEY = 'mailto.prompted-about-default';

describe('DefaultClientNotif', function DefaultClientNotifTests() {
  afterEach(cleanup);

  describe("when Mailspring isn't the default mail client", () => {
    beforeEach(() => {
      stubIsRegistered = false;
    });

    describe('when the user has already responded', () => {
      let container;
      beforeEach(() => {
        spyOn(AppEnv.config, 'get').andReturn(true);
        ({ container } = render(<DefaultClientNotification />));
        expect(AppEnv.config.get).toHaveBeenCalledWith(SETTINGS_KEY);
      });
      it('renders nothing', () => {
        expect(container.querySelector('.notification') !== null).toEqual(false);
      });
    });

    describe('when the user has yet to respond', () => {
      let container;
      beforeEach(() => {
        spyOn(AppEnv.config, 'get').andReturn(false);
        ({ container } = render(<DefaultClientNotification />));
        expect(AppEnv.config.get).toHaveBeenCalledWith(SETTINGS_KEY);
      });
      it('renders a notification', () => {
        expect(container.querySelector('.notification') !== null).toEqual(true);
      });

      it('allows the user to set Mailspring as the default client', () => {
        let scheme = null;
        stubRegister = urlScheme => {
          scheme = urlScheme;
        };
        fireEvent.click(container.querySelector('#action-0'));
        expect(scheme).toEqual('mailto');
      });

      it('allows the user to decline', () => {
        spyOn(AppEnv.config, 'set');
        fireEvent.click(container.querySelector('#action-1'));
        expect(AppEnv.config.set).toHaveBeenCalledWith(SETTINGS_KEY, true);
      });
    });
  });

  describe('when Mailspring is the default mail client', () => {
    let container;
    beforeEach(() => {
      stubIsRegistered = true;
      ({ container } = render(<DefaultClientNotification />));
    });
    it('renders nothing', () => {
      expect(container.querySelector('.notification') !== null).toEqual(false);
    });
  });
});
