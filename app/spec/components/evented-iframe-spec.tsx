import React from 'react';
import ReactDOM from 'react-dom';
import ReactTestUtils from 'react-dom/test-utils';
const EventedIFrame = require('../../src/components/evented-iframe').EventedIFrame;

describe('EventedIFrame', () => {
  describe('context menu Copy', function () {
    // The menu is built from @electron/remote, whose exports are read-only getters, so the
    // module is swapped in the require cache for one whose items can be inspected and clicked.
    const remotePath = require.resolve('@electron/remote');
    let realRemote: any;
    let items: any[];
    let clipboard: { writeText: jasmine.Spy };
    let webContentsCopy: jasmine.Spy;
    let container: HTMLDivElement;
    let frame: any;
    let doc: Document;

    beforeEach(function () {
      items = [];
      clipboard = { writeText: jasmine.createSpy('writeText') };
      realRemote = require.cache[remotePath].exports;
      require.cache[remotePath].exports = {
        Menu: class {
          append(item: any) {
            items.push(item);
          }
          popup() {}
        },
        MenuItem: class {
          constructor(options: any) {
            Object.assign(this, options);
          }
        },
        clipboard,
      };
      webContentsCopy = jasmine.createSpy('copy');
      spyOn(AppEnv, 'getCurrentWindow').andReturn({ webContents: { copy: webContentsCopy } });

      container = document.createElement('div');
      document.body.appendChild(container);
      frame = ReactDOM.render(<EventedIFrame />, container);
      doc = (ReactDOM.findDOMNode(frame) as HTMLIFrameElement).contentDocument;
    });

    afterEach(function () {
      require.cache[remotePath].exports = realRemote;
      ReactDOM.unmountComponentAtNode(container);
      container.remove();
    });

    const openMenuOn = (target: Element) =>
      frame._onIFrameContextualMenu({ preventDefault() {}, target } as any);
    const clickItem = (label: string) => items.find((item) => item.label === label).click();

    it('copies a selection the way Cmd+C does, so its HTML reaches the clipboard', function () {
      doc.body.innerHTML = '<p><b>Bold</b> and <a href="https://example.com">a link</a></p>';
      doc.getSelection().selectAllChildren(doc.body);

      openMenuOn(doc.querySelector('b'));
      clickItem('Copy');

      expect(webContentsCopy).toHaveBeenCalled();
      expect(clipboard.writeText).not.toHaveBeenCalled();
    });

    it('copies plain text when nothing is selected', function () {
      doc.body.innerHTML = '<p><a href="https://example.com">a link</a></p>';

      openMenuOn(doc.querySelector('a'));
      clickItem('Copy');
      clickItem('Copy Link Address');

      expect(clipboard.writeText.argsForCall).toEqual([['a link'], ['https://example.com']]);
      expect(webContentsCopy).not.toHaveBeenCalled();
    });

    it('copies the selected text if the selection is gone by the time Copy is clicked', function () {
      doc.body.innerHTML = '<p><b>Bold</b> text</p>';
      doc.getSelection().selectAllChildren(doc.querySelector('b'));

      openMenuOn(doc.querySelector('b'));
      doc.getSelection().empty();
      clickItem('Copy');

      expect(clipboard.writeText).toHaveBeenCalledWith('Bold');
      expect(webContentsCopy).not.toHaveBeenCalled();
    });
  });

  describe('link clicking behavior', function () {
    beforeEach(function () {
      this.frame = ReactTestUtils.renderIntoDocument(<EventedIFrame src="about:blank" />);

      this.setAttributeSpy = jasmine.createSpy('setAttribute');
      this.preventDefaultSpy = jasmine.createSpy('preventDefault');
      this.openLinkSpy = jasmine.createSpy('openLink');

      this.oldOpenLink = AppEnv.windowEventHandler.openLink;
      AppEnv.windowEventHandler.openLink = this.openLinkSpy;

      this.fakeEvent = (href) => {
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

    afterEach(function () {
      AppEnv.windowEventHandler.openLink = this.oldOpenLink;
    });

    it('works for acceptable link types', function () {
      const hrefs = [
        'http://mailspring.com',
        'https://www.mailspring.com',
        'mailto:evan@mailspring.com',
        'tel:8585311718',
        'custom:www.mailspring.com',
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

    it('corrects relative uris', function () {
      const hrefs = ['mailspring.com', 'www.mailspring.com'];
      for (let i = 0; i < hrefs.length; i++) {
        const href = hrefs[i];
        this.frame._onIFrameClick(this.fakeEvent(href));
        expect(this.setAttributeSpy).toHaveBeenCalled();
        const modifiedHref = this.setAttributeSpy.calls[i].args[1];
        expect(modifiedHref).toBe(`http://${href}`);
      }
    });

    it('corrects protocol-relative uris', function () {
      const hrefs = ['//mailspring.com', '//www.mailspring.com'];
      for (let i = 0; i < hrefs.length; i++) {
        const href = hrefs[i];
        this.frame._onIFrameClick(this.fakeEvent(href));
        expect(this.setAttributeSpy).toHaveBeenCalled();
        const modifiedHref = this.setAttributeSpy.calls[i].args[1];
        expect(modifiedHref).toBe(`https:${href}`);
      }
    });

    it('disallows malicious uris', function () {
      const hrefs = ['file://usr/bin/bad'];
      for (const href of Array.from(hrefs)) {
        this.frame._onIFrameClick(this.fakeEvent(href));
        expect(this.preventDefaultSpy).toHaveBeenCalled();
        expect(this.openLinkSpy).not.toHaveBeenCalled();
      }
    });
  });
});
