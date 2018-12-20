(function() {
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

  var messageNodes = document.querySelectorAll('.message-item-area>span');

  removeScrollClasses();
  rebuildMessages(messageNodes, window.printMessages);

  document.getElementById('print-button').addEventListener('click', () => {
    setTimeout(function() {
      window.print();
    }, 0);
  });
  document.getElementById('print-pdf-button').addEventListener('click', () => {
    setTimeout(function() {
      window.printToPDF();
    }, 0);
  });
  document.getElementById('close-button').addEventListener('click', () => {
    window.close();
  });

  const note = document.getElementById('print-note');
  const spacing = document.getElementById('print-header-spacing');
  if (document.querySelector('.message-item-wrap.collapsed')) {
    note.style.display = 'block';
    spacing.style.height = '90px';
  }
})();
