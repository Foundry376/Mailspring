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

  function removeScrollClasses() {
    var scrollRegions = document.querySelectorAll('.scroll-region');
    var scrollContents = document.querySelectorAll('.scroll-region-content');
    var scrollContentInners = document.querySelectorAll('.scroll-region-content-inner');
    removeClassFromNodes(scrollRegions, 'scroll-region');
    removeClassFromNodes(scrollContents, 'scroll-region-content');
    removeClassFromNodes(scrollContentInners, 'scroll-region-content-inner');
  }

  function continueAndPrint() {
    document.getElementById('print-button').style.display = 'none';
    window.requestAnimationFrame(function () {
      window.print();
      // Close this print window after selecting to print
      // This is really hackish but appears to be the only working solution
      setTimeout(window.close, 500);
    });
  }

  var messageNodes = document.querySelectorAll('.message-item-area>span');

  removeScrollClasses();
  rebuildMessages(messageNodes, window.printMessages);
  removeAllDarkModeStyles();

  document.getElementById('print-button').addEventListener('click', continueAndPrint);
  window.continueAndPrint = continueAndPrint;

  if (document.querySelector('.message-item-wrap.collapsed')) {
    const note = document.createElement('div');
    note.classList.add('print-note');
    note.innerText =
      'One or more messages in this thread were collapsed and will not be printed. To print these messages, expand them in the main window.';
    document.body.insertBefore(note, document.body.children[0]);
  }
})();
