const React = require('react');
const ReactTestUtils = require('react-dom/test-utils');
const EventedIFrame = require('../../src/components/evented-iframe');

describe('EventedIFrame', () =>
  describe('link clicking behavior', function() {
    beforeEach(function() {
      this.frame = ReactTestUtils.renderIntoDocument(<EventedIFrame src="about:blank" />);

      this.setAttributeSpy = jasmine.createSpy('setAttribute');
      this.preventDefaultSpy = jasmine.createSpy('preventDefault');
      this.openLinkSpy = jasmine.createSpy('openLink');

      this.oldOpenLink = AppEnv.windowEventHandler.openLink;
      AppEnv.windowEventHandler.openLink = this.openLinkSpy;

      this.fakeEvent = href => {
        return {
          stopPropagation() {},
          preventDefault: this.preventDefaultSpy,
          target: {
            getAttribute(attr) {
              return href;
            },
            setAttribute: this.setAttributeSpy,
          },
        };
      };
    });

    afterEach(function() {
      AppEnv.windowEventHandler.openLink = this.oldOpenLink;
    });

    it('works for acceptable link types', function() {
      const hrefs = [
        'http://nylas.com',
        'https://www.nylas.com',
        'mailto:evan@nylas.com',
        'tel:8585311718',
        'custom:www.nylas.com',
      ];
      for (let i = 0; i < hrefs.length; i++) {
        const href = hrefs[i];
        this.frame._onIFrameClick(this.fakeEvent(href));
        expect(this.setAttributeSpy).not.toHaveBeenCalled();
        expect(this.openLinkSpy).toHaveBeenCalled();
        const { target } = this.openLinkSpy.calls[i].args[0];
        const targetHref = this.openLinkSpy.calls[i].args[0].href;
        expect(target).not.toBeDefined();
        expect(targetHref).toBe(href);
      }
    });

    it('corrects relative uris', function() {
      const hrefs = ['nylas.com', 'www.nylas.com'];
      for (let i = 0; i < hrefs.length; i++) {
        const href = hrefs[i];
        this.frame._onIFrameClick(this.fakeEvent(href));
        expect(this.setAttributeSpy).toHaveBeenCalled();
        const modifiedHref = this.setAttributeSpy.calls[i].args[1];
        expect(modifiedHref).toBe(`http://${href}`);
      }
    });

    it('corrects protocol-relative uris', function() {
      const hrefs = ['//nylas.com', '//www.nylas.com'];
      for (let i = 0; i < hrefs.length; i++) {
        const href = hrefs[i];
        this.frame._onIFrameClick(this.fakeEvent(href));
        expect(this.setAttributeSpy).toHaveBeenCalled();
        const modifiedHref = this.setAttributeSpy.calls[i].args[1];
        expect(modifiedHref).toBe(`https:${href}`);
      }
    });

    it('disallows malicious uris', function() {
      const hrefs = ['file://usr/bin/bad'];
      for (let href of Array.from(hrefs)) {
        this.frame._onIFrameClick(this.fakeEvent(href));
        expect(this.preventDefaultSpy).toHaveBeenCalled();
        expect(this.openLinkSpy).not.toHaveBeenCalled();
      }
    });
  }));
