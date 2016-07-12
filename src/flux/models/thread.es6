import _ from 'underscore'
import Message from './message'
import Contact from './contact'
import Category from './category'
import Folder from './folder'
import Label from './label'
import Attributes from '../attributes'
import DatabaseStore from '../stores/database-store'
import ModelWithMetadata from './model-with-metadata'


/**
  Public: The Thread model represents a Thread object served by the Nylas Platform API.
  For more information about Threads on the Nylas Platform, read the
  [Threads API Documentation](https://nylas.com/cloud/docs#threads)

  Attributes

  `snippet`: {AttributeString} A short, ~140 character string with the content
    of the last message in the thread. Queryable.

  `subject`: {AttributeString} The subject of the thread. Queryable.

  `unread`: {AttributeBoolean} True if the thread is unread. Queryable.

  `starred`: {AttributeBoolean} True if the thread is starred. Queryable.

  `version`: {AttributeNumber} The version number of the thread.

  `participants`: {AttributeCollection} A set of {Contact} models
    representing the participants in the thread.
    Note: Contacts on Threads do not have IDs.

  `lastMessageReceivedTimestamp`: {AttributeDateTime} The timestamp of the
    last message on the thread.

  This class also inherits attributes from {Model}

  Section: Models
  @class Thread
*/
class Thread extends ModelWithMetadata {

  static attributes = _.extend({}, ModelWithMetadata.attributes, {
    snippet: Attributes.String({
      modelKey: 'snippet',
    }),

    subject: Attributes.String({
      queryable: true,
      modelKey: 'subject',
    }),

    unread: Attributes.Boolean({
      queryable: true,
      modelKey: 'unread',
    }),

    starred: Attributes.Boolean({
      queryable: true,
      modelKey: 'starred',
    }),

    version: Attributes.Number({
      queryable: true,
      modelKey: 'version',
    }),

    categories: Attributes.Collection({
      queryable: true,
      modelKey: 'categories',
      joinOnField: 'id',
      joinQueryableBy: ['inAllMail', 'lastMessageReceivedTimestamp', 'lastMessageSentTimestamp', 'unread'],
      itemClass: Category,
    }),

    folders: Attributes.Collection({
      queryable: true,
      modelKey: 'folders',
      joinOnField: 'id',
      joinQueryableBy: ['inAllMail', 'lastMessageReceivedTimestamp', 'lastMessageSentTimestamp', 'unread'],
      itemClass: Folder,
    }),

    labels: Attributes.Collection({
      queryable: true,
      modelKey: 'labels',
      joinOnField: 'id',
      joinQueryableBy: ['inAllMail', 'lastMessageReceivedTimestamp', 'lastMessageSentTimestamp', 'unread'],
      itemClass: Label,
    }),

    participants: Attributes.Collection({
      queryable: true,
      modelKey: 'participants',
      joinOnField: 'email',
      joinQueryableBy: ['lastMessageReceivedTimestamp'],
      itemClass: Contact,
    }),

    hasAttachments: Attributes.Boolean({
      modelKey: 'has_attachments',
    }),

    lastMessageReceivedTimestamp: Attributes.DateTime({
      queryable: true,
      modelKey: 'lastMessageReceivedTimestamp',
      jsonKey: 'last_message_received_timestamp',
    }),

    lastMessageSentTimestamp: Attributes.DateTime({
      queryable: true,
      modelKey: 'lastMessageSentTimestamp',
      jsonKey: 'last_message_sent_timestamp',
    }),

    inAllMail: Attributes.Boolean({
      queryable: true,
      modelKey: 'inAllMail',
      jsonKey: 'in_all_mail',
    }),
  })

  static naturalSortOrder = () => {
    return Thread.attributes.lastMessageReceivedTimestamp.descending()
  }

  static additionalSQLiteConfig = {
    setup: () => [
      // ThreadCounts
      'CREATE TABLE IF NOT EXISTS `ThreadCounts` (`category_id` TEXT PRIMARY KEY, `unread` INTEGER, `total` INTEGER)',
      'CREATE UNIQUE INDEX IF NOT EXISTS ThreadCountsIndex ON `ThreadCounts` (category_id DESC)',

      // ThreadContact
      'CREATE INDEX IF NOT EXISTS ThreadContactDateIndex ON `ThreadContact` (last_message_received_timestamp DESC, value, id)',

      // ThreadCategory
      'CREATE INDEX IF NOT EXISTS ThreadListCategoryIndex ON `ThreadCategory` (last_message_received_timestamp DESC, value, in_all_mail, unread, id)',
      'CREATE INDEX IF NOT EXISTS ThreadListCategorySentIndex ON `ThreadCategory` (last_message_sent_timestamp DESC, value, in_all_mail, unread, id)',

      // Thread: General index
      'CREATE INDEX IF NOT EXISTS ThreadDateIndex ON `Thread` (last_message_received_timestamp DESC)',

      // Thread: Partial indexes for specific views
      'CREATE INDEX IF NOT EXISTS ThreadUnreadIndex ON `Thread` (account_id, last_message_received_timestamp DESC) WHERE unread = 1 AND in_all_mail = 1',
      'CREATE INDEX IF NOT EXISTS ThreadUnifiedUnreadIndex ON `Thread` (last_message_received_timestamp DESC) WHERE unread = 1 AND in_all_mail = 1',

      'DROP INDEX IF EXISTS `Thread`.ThreadStarIndex',
      'CREATE INDEX IF NOT EXISTS ThreadStarredIndex ON `Thread` (account_id, last_message_received_timestamp DESC) WHERE starred = 1 AND in_all_mail = 1',
      'CREATE INDEX IF NOT EXISTS ThreadUnifiedStarredIndex ON `Thread` (last_message_received_timestamp DESC) WHERE starred = 1 AND in_all_mail = 1',
    ],
  }

  static searchable = true

  static searchFields = ['subject', 'participants', 'body']

  messages() {
    return (
      DatabaseStore.findAll(Message)
      .where({threadId: this.id})
      .include(Message.attributes.body)
    )
  }


  get inAllMail() {
    if (this.labels && this.labels.length > 0) {
      const inAllMail = _.any(this.labels, label => label.name === 'all')
      if (inAllMail) {
        return true;
      }
      const inTrashOrSpam = _.any(this.labels, label => label.name === 'trash' || label.name === 'spam')
      if (!inTrashOrSpam) {
        return true;
      }
      return false
    }
    return true
  }

  fromJSON(json) {
    super.fromJSON(json);
    // this.labels = this.labels || [];
    // this.folders = this.folders || [];

    ['participants', 'labels', 'folders'].forEach((attr) => {
      const value = this[attr]
      if (!(value && value instanceof Array)) {
        return;
      }
      value.forEach((item) => {
        item.accountId = this.accountId
      })
    })
    return this
  }

  /**
  * Public: Returns true if the thread has a {Category} with the given
  * name. Note, only catgories of type `Category.Types.Standard` have valid
  * `names`
  * - `id` A {String} {Category} name
  */
  categoryNamed(name) {
    return _.findWhere(this.folders.concat(this.labels), {name})
  }

  sortedLabels() {
    if (!this.labels) {
      return []
    }
    let out = []
    const isImportant = (l) => l.name === 'important'
    const isStandardCategory = (l) => l.isStandardCategory()
    const isUnhiddenStandardLabel = (l) => (
      !isImportant(l) &&
      isStandardCategory(l) &&
      !(l.isHiddenCategory())
    )

    const importantLabel = _.find(this.labels, isImportant)
    if (importantLabel) {
      out = out.concat(importantLabel)
    }

    const standardLabels = _.filter(this.labels, isUnhiddenStandardLabel)
    if (standardLabels.length > 0) {
      out = out.concat(standardLabels)
    }

    const userLabels = _.filter(this.labels, (l) => (
      !isImportant(l) && !isStandardCategory(l)
    ))
    if (userLabels.length > 0) {
      out = out.concat(_.sortBy(userLabels, 'displayName'))
    }
    return out
  }
}


export default Thread
