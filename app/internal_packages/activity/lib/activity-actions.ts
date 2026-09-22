import Reflux from 'reflux';

export const markViewed = Reflux.createAction('markViewed');
markViewed.sync = true;

export const selectTab = Reflux.createAction('selectTab');
selectTab.sync = true;

export const searchFeed = Reflux.createAction('searchFeed');
searchFeed.sync = true;
