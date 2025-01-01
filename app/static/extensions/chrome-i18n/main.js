/* global chrome */

const dispatch = async event => {
  const { call, text } = JSON.parse(event.data);
  if (call === 'detectLanguage') {
    let result = null;
    let error = null;
    try {
      result = await chrome.i18n.detectLanguage(text);
    } catch (err) {
      error = err;
    }
    window.postMessage(JSON.stringify({ response: 'detectLanguage', text, result, error }), '*');
  }
};

window.addEventListener('message', dispatch, false);
