import path from 'path';
import fs from 'fs';

import { localized } from 'mailspring-exports';
import { escapeHTML } from 'underscore.string';

const { app, BrowserWindow, dialog } = require('@electron/remote');

export default class PrintWindow {
  browserWin: Electron.BrowserWindow;
  tmpFile: string;

  constructor({ subject, account, participants, styleTags, htmlContent, printMessages }) {
    // This script will create the print prompt when loaded. We can also call
    // print directly from this process, but inside print.js we can make sure to
    // call window.print() after we've cleaned up the dom for printing
    const tmp = app.getPath('temp');
    const tmpMessagesPath = path.join(tmp, 'print.messages.js');

    const preloadPath = path.join(__dirname, '..', 'static', 'print-preload.js');
    const scriptPath = path.join(__dirname, '..', 'static', 'print.js');
    const stylesPath = path.join(__dirname, '..', 'static', 'print-styles.css');
    const participantsHtml = participants
      .map(part => {
        return `<li class="participant"><span>
          ${escapeHTML(part.name || '')} &lt;${escapeHTML(part.email)}&gt;
        </span></li>`;
      })
      .join('');

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta http-equiv="Content-Security-Policy" content="default-src * mailspring:; frame-src 'none'; script-src 'self' chrome-extension://react-developer-tools; style-src * 'unsafe-inline' mailspring:; img-src * data: mailspring: file:; object-src none; media-src none; manifest-src none;">
          <meta charset="utf-8">
          ${styleTags}
          <link rel="stylesheet" type="text/css" href="${stylesPath}">
        </head>
        <body>
          <div id="print-header">
            <div id="print-note" style="display: none;">
              One or more messages in this thread were collapsed and will not be printed.
              To print these messages, expand them in the main window.
            </div>
            <div style="padding: 10px 14px;">
              <div id="close-button">
                ${escapeHTML(localized('Close'))}
              </div>
              <div id="print-button">
                ${escapeHTML(localized('Print'))}
              </div>
              <div id="print-pdf-button">
                ${escapeHTML(localized('Save as PDF'))}
              </div>
              <div class="logo-wrapper">
                <span class="account">${escapeHTML(account.name)} &lt;${escapeHTML(
      account.email
    )}&gt;</span>
              </div>
            </div>
          </div>
          <div id="print-header-spacing"></div>
          <h1 class="print-subject">${escapeHTML(subject)}</h1>
          <div class="print-participants">
            <ul>
              ${participantsHtml}
            </ul>
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
      title: `${localized('Print')} - ${subject}`,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: false,
      },
    });

    this.browserWin.webContents.ipc.on('print-to-pdf', async () => {
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: `${subject}.pdf`,
      });

      if (!filePath) {
        return;
      }
      const data = await this.browserWin.webContents.printToPDF({
        margins: { marginType: 'none' },
        pageSize: 'Letter',
        printBackground: true,
        landscape: false,
      });
      fs.writeFileSync(filePath, data);
    });

    this.browserWin.removeMenu();
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
