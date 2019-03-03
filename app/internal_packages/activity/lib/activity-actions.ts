import Reflux from 'reflux';

export const markViewed = Reflux.createAction('markViewed');
markViewed.sync = true;
