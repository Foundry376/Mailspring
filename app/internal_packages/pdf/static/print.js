(function () {
  function rebuildMessages(messageNodes, messages) {
    // Simply insert the message html inside the appropriate node
    for (var idx = 0; idx < messageNodes.length; idx++) {
      var msgNode = messageNodes[idx];
      var msgHtml = messages[idx];
      msgNode.innerHTML = msgHtml;
    }
  }

  function removeClassFromNodes(nodeList, className) {
    for (var idx = 0; idx < nodeList.length; idx++) {
      var node = nodeList[idx];
      var re = new RegExp('\\b' + className + '\\b', 'g');
      node.className = node.className.replace(re, '');
    }
  }

  function removeScrollClasses() {
    var scrollRegions = document.querySelectorAll('.scroll-region');
    var scrollContents = document.querySelectorAll('.scroll-region-content');
    var scrollContentInners = document.querySelectorAll('.scroll-region-content-inner');
    removeClassFromNodes(scrollRegions, 'scroll-region');
    removeClassFromNodes(scrollContents, 'scroll-region-content');
    removeClassFromNodes(scrollContentInners, 'scroll-region-content-inner');
  }

  function removeAllDarkModeStyles() {
    var colorProperties = ['color', 'background-color'];
    Array.from(document.querySelectorAll('*')).reverse().forEach(node => {
      for (var prop of colorProperties) {
        var style = node.style;
        if (style.getPropertyPriority(prop) === 'important') {
          style.removeProperty(prop);
        }
      }
    });
  }

  function exportToPDF() {
    const remote = require('electron').remote;
    const fs = require('fs');
    const webContent = remote.getCurrentWebContents();
    remote.dialog.showSaveDialog(remote.getCurrentWindow(), (filename) => {
      console.log("filename is: " + filename);
      webContent.printToPDF({ pageSize: 'A4' }, (error, data) => {
        if (error) {
          AppEnv.reportError(error);
          setTimeout(window.close, 500);
        } else {
          fs.writeFile(filename, data, (err) => {
            if (err) {
              AppEnv.reportError(error);
            }
            console.log('Write PDF successfully.')
            setTimeout(window.close, 500);
          })
        }
      })
    });
  }

  var messageNodes = document.querySelectorAll('.message-item-area>span');

  removeScrollClasses();
  rebuildMessages(messageNodes, window.printMessages);
  removeAllDarkModeStyles();

  document.getElementById('pdf-button').addEventListener('click', exportToPDF);
  window.exportToPDF = exportToPDF;

  if (document.querySelector('.message-item-wrap.collapsed')) {
    const note = document.createElement('div');
    note.classList.add('print-note');
    note.innerText =
      'One or more messages in this thread were collapsed and will not be printed. To print these messages, expand them in the main window.';
    document.body.insertBefore(note, document.body.children[0]);
  }
})();
