const { ipcRenderer } = require('electron');

ipcRenderer.on('click-signin', () => {
  const signIn = document.querySelector('body > div.container > form > div:nth-child(7) > a')
  if (signIn) {
    signIn.click();
  }
});

ipcRenderer.on('load-credentials', () => {
  const emailField = document.querySelector('#emailAddress');
  const passwordField = document.querySelector('#password');
  const submit = document.getElementsByClassName('main')[0];

  if (emailField && passwordField && submit) {
    emailField.value = 'edison.desktop@gmail.com';
    passwordField.value = 'UzAsN0NObywNJbSjhNC9';
    submit.submit();
  }
});
