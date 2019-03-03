import Reflux from 'reflux';

export const moveToPreviousPage = Reflux.createAction('moveToPreviousPage');
moveToPreviousPage.sync = true;

export const moveToPage = Reflux.createAction('moveToPage');
moveToPage.sync = true;

export const setAccount = Reflux.createAction('setAccount');
setAccount.sync = true;

export const chooseAccountProvider = Reflux.createAction('chooseAccountProvider');
chooseAccountProvider.sync = true;

export const identityJSONReceived = Reflux.createAction('identityJSONReceived');
identityJSONReceived.sync = true;

export const finishAndAddAccount = Reflux.createAction('finishAndAddAccount');
finishAndAddAccount.sync = true;
