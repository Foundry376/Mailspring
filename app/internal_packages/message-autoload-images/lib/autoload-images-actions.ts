import Reflux from 'reflux';

export const temporarilyEnableImages = Reflux.createAction('temporarilyEnableImages');
temporarilyEnableImages.sync = true;

export const permanentlyEnableImages = Reflux.createAction('permanentlyEnableImages');
permanentlyEnableImages.sync = true;
