import path from 'path';
import fs from 'fs';
import { remote } from 'electron';

const { app, BrowserWindow } = remote;

export default class PrintWindow {
  constructor({ subject, account, participants, styleTags, htmlContent, printMessages }) {
    // This script will create the print prompt when loaded. We can also call
    // print directly from this process, but inside print.js we can make sure to
    // call window.print() after we've cleaned up the dom for printing
    const tmp = app.getPath('temp');
    const tmpMessagesPath = path.join(tmp, 'print.messages.js');

    const scriptPath = path.join(__dirname, '..', 'static', 'print.js');
    const stylesPath = path.join(__dirname, '..', 'static', 'print-styles.css');
    const participantsHtml = participants
      .map(part => {
        return `<li class="participant"><span>${part.name || ''} &lt;${part.email}&gt;</span></li>`;
      })
      .join('');

    const content = `
      <html>
        <head>
          <meta http-equiv="Content-Security-Policy" content="default-src * edisonmail:; script-src 'self' chrome-extension://react-developer-tools; style-src * 'unsafe-inline' edisonmail:; img-src * data: edisonmail: file:;">
          <meta charset="utf-8">
          ${styleTags}
          <link rel="stylesheet" type="text/css" href="${stylesPath}">
        </head>
        <body>
          <div id="print-header">
            <div id="print-button">
              Print
            </div>
            <div class="logo-wrapper">
              <span class="account">${account.name} &lt;${account.email}&gt;</span>
            </div>
            <h1>${subject}</h1>
          <div class="participants">
            <ul>
              ${participantsHtml}
            </ul>
          </div>
          </div>
          ${htmlContent}
          <script type="text/javascript" src="${tmpMessagesPath}"></script>
          <script type="text/javascript" src="${scriptPath}"></script>
        </body>
      </html>
    `;

    this.tmpFile = path.join(tmp, 'print.html');
    this.browserWin = new BrowserWindow({
      width: 800,
      height: 600,
      title: `Print - ${subject}`,
      webPreferences: {
        nodeIntegration: false,
      },
    });
    this.browserWin.setMenu(null);
    fs.writeFileSync(tmpMessagesPath, `window.printMessages = ${printMessages}`);
    fs.writeFileSync(this.tmpFile, content);
  }

  /**
   * Load our temp html file. Once the file is loaded it will run print.js, and
   * that script will pop out the print dialog.
   */
  load() {
    this.browserWin.loadURL(`file://${this.tmpFile}`);
  }
}
