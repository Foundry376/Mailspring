import AutoUpdateManager from '../src/browser/autoupdate-manager';

describe('AutoUpdateManager', function () {
  beforeEach(function () {
    this.mailspringIdentityId = null;
    this.checkAutomatically = undefined;
    this.specMode = true;
    this.config = {
      set: jasmine.createSpy('config.set'),
      get: (key) => {
        if (key === 'identity.id') {
          return this.mailspringIdentityId;
        }
        if (key === 'env') {
          return 'production';
        }
        if (key === 'core.updates.checkAutomatically') {
          return this.checkAutomatically;
        }
      },
      onDidChange: (key, callback) => {
        return callback();
      },
    };
  });

  describe('with attached commit version', () =>
    it('correctly sets the feedURL', function () {
      const m = new AutoUpdateManager('3.222.1-abc', this.config, this.specMode);
      spyOn(m, 'setupAutoUpdater');
      expect(m.feedURL).toEqual(
        'https://updates.getmailspring.com/check/' +
          process.platform +
          '/' +
          process.arch +
          '/3.222.1-abc/anonymous/stable?osVersion=' +
          encodeURIComponent(process.getSystemVersion())
      );
    }));

  describe('with no attached commit', () =>
    it('correctly sets the feedURL', function () {
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      spyOn(m, 'setupAutoUpdater');
      expect(m.feedURL).toEqual(
        'https://updates.getmailspring.com/check/' +
          process.platform +
          '/' +
          process.arch +
          '/3.222.1/anonymous/stable?osVersion=' +
          encodeURIComponent(process.getSystemVersion())
      );
    }));

  describe('when an update identity is already set', () =>
    it('should send it and not save any changes', function () {
      this.mailspringIdentityId = 'test-mailspring-id';
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      expect(m.feedURL).toEqual(
        'https://updates.getmailspring.com/check/' +
          process.platform +
          '/' +
          process.arch +
          '/3.222.1/test-mailspring-id/stable?osVersion=' +
          encodeURIComponent(process.getSystemVersion())
      );
    }));

  describe('when an update identity is added', () =>
    it('should update the feed URL', function () {
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      spyOn(m, 'setupAutoUpdater');
      expect(m.feedURL.includes('anonymous')).toEqual(true);
      this.mailspringIdentityId = 'test-mailspring-id';
      m.updateFeedURL();
      expect(m.feedURL.includes(this.mailspringIdentityId)).toEqual(true);
    }));

  describe('checkAutomatically', function () {
    beforeEach(function () {
      this.m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      spyOn(this.m, 'check');
    });

    it('checks when the preference is unset or on', function () {
      this.m.checkAutomatically();
      this.checkAutomatically = true;
      this.m.checkAutomatically();
      expect(this.m.check.calls.length).toEqual(2);
    });

    it('does not check when the preference is off', function () {
      this.checkAutomatically = false;
      this.m.checkAutomatically();
      expect(this.m.check).not.toHaveBeenCalled();
    });

    it('does not check again once an update is ready to install', function () {
      this.m.setState('update-available');
      this.m.checkAutomatically();
      expect(this.m.check).not.toHaveBeenCalled();
    });
  });
});
