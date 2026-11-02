(function() {
  // Wrapper rules live here rather than in print-styles.css, which can't reach into the
  // shadow roots. The copied theme styles carry the app's text color, light in a dark theme.
  var MESSAGE_STYLES =
    ':host { display: block; }' +
    '#inbox-html-wrapper, #inbox-plain-wrapper {' +
    '  margin-top: 10px; --email-text-color: black !important; color: black !important;' +
    '}' +
    '@media only print { #inbox-html-wrapper, #inbox-plain-wrapper {' +
    '  display: block !important; width: auto !important; height: auto !important;' +
    '  overflow: visible !important;' +
    '} }';

  // Each message carries its own <style> tags (the sender's, plus the email frame's theme
  // styles). A shadow root keeps them from restyling the print header, participant list and
  // other messages, as an iframe does on screen.
  function rebuildMessages(messageNodes, messages) {
    for (var idx = 0; idx < messageNodes.length; idx++) {
      var msgNode = messageNodes[idx];
      msgNode.textContent = '';
      var root = msgNode.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>' + MESSAGE_STYLES + '</style>' + messages[idx];
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

  function replaceRelativeDates() {
    var dates = document.querySelectorAll('.message-time');
    dates.forEach(d => {
      d.innerText = d.getAttribute('title');
    });
  }
  var messageNodes = document.querySelectorAll('.message-item-area>span');

  removeScrollClasses();
  rebuildMessages(messageNodes, window.printMessages);
  replaceRelativeDates();

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
