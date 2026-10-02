import { AccountStore, Actions, Thread } from 'mailspring-exports';
import PrintWindow from './print-window';

class Printer {
  public unsub = Actions.printThread.listen(this._printThread);

  _printThread(thread: Thread, htmlContent: string) {
    if (!thread) throw new Error('Printing: No thread active!');
    const account = AccountStore.accountForId(thread.accountId);

    // Get the <mailspring-styles> tag present in the document
    const styleTag = document.getElementsByTagName('managed-styles')[0];
    // These iframes should correspond to the message iframes when a thread is
    // focused
    const iframes = document.getElementsByTagName('iframe');
    // Grab the html inside the iframes. The dark "email render mode" style inverts
    // the iframe's <body>; inlined into the print document it would invert the
    // whole page, so it is dropped here.
    const messagesHtml = [].slice.call(iframes).map((iframe) => {
      const root = iframe.contentDocument.documentElement.cloneNode(true) as HTMLElement;
      root.querySelectorAll('style[data-email-render-mode]').forEach((el) => el.remove());
      return root.innerHTML;
    });

    const win = new PrintWindow({
      subject: thread.subject,
      account: {
        name: account.name,
        email: account.emailAddress,
      },
      participants: thread.participants,
      styleTags: styleTag.innerHTML,
      htmlContent,
      printMessages: JSON.stringify(messagesHtml),
    });
    win.load();
  }

  deactivate() {
    this.unsub();
  }
}

export default Printer;
