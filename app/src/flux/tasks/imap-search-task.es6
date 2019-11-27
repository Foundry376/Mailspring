import Task from './task';
import Attributes from '../attributes';
import Category from '../models/category';

/*
Send the SEARCH IMAP command query to native.
## Attributes
'query': User entered search query.
'paths': A collection of folder path in the original ut7 format. Indicating to native the folders that needs to be searched.
 */

export default class IMAPSearchTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    query: Attributes.Object({
      modelKey: 'query',
    }),
    paths: Attributes.Collection({
      modelKey: 'paths',
    }),
    fullTextSearch: Attributes.String({
      modelKey: 'fullTextSearch',
    })
  });
  constructor({ accountId, paths = [], fullTextSearch = '', query = {}, ...rest } = {}) {
    super(rest);
    this.accountId = accountId;
    this.fullTextSearch = fullTextSearch;
    this.query = query;
    this.paths = [];
    paths.forEach(folder => {
      if (folder instanceof Category) {
        this.paths.push(folder);
      }
    });
  }

  label() {
    return `IMAP remote search`;
  }
}
