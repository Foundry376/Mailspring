import MailspringStore from 'mailspring-store';
import MessageStore from './message-store';
import DatabaseStore from './database-store';
import AttachmentStore from './attachment-store';
import AccountStore from './account-store';
import Calender from '../models/calendar';
import Message from '../models/message';
import Contact from '../models/contact';
import DraftFactory from './draft-factory';
import Thread from '../models/thread';
import CalendarTask from '../tasks/calendar-task';
import Actions from '../actions';
import fs from 'fs';

class CalendarStore extends MailspringStore {
  static replyTemplate = ({
                            eventString = '',
                            timezoneString = '',
                            todoString = '',
                            journalString = '',
                          }) => {
    return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REPLY\r\nPRODID:-//EdisonMail\r\n${timezoneString}\r\n${eventString}\r\n${todoString}\r\n${journalString}\r\nEND:VCALENDAR`;
  };

  constructor() {
    super();
    this._calendarCache = {};
    this._processingQueue = {};
    this._currentThreadId = '';

    this.listenTo(MessageStore, this._onMessageStoreChange);
    this.listenTo(DatabaseStore, this._onMessageDataChange);
    Actions.RSVPEvent.listen(this.replyToCalendarEventByMessage, this);
  }

  getCalendarByMessageId(messageId) {
    if (!this._calendarCache[messageId]) {
      return null;
    }
    return this._calendarCache[messageId].calendar;
  }

  needRSVPByMessage(message) {
    if (!message) {
      return false;
    }
    const account = AccountStore.accountForId(message.accountId);
    if (!account) {
      return false;
    }
    const cal = this.getCalendarByMessageId(message.id);
    if (!cal) {
      return false;
    }
    if (cal.method.toLocaleUpperCase() !== 'REQUEST') {
      return false;
    }
    const e = cal.getFirstEvent();
    if (!e) {
      return false;
    }
    return e.needToRsvpByEmail(account.emailAddress);
  }

  replyToCalendarEventByMessage(message, reply) {
    if (!message) {
      return false;
    }
    const account = AccountStore.accountForId(message.accountId);
    if (!account) {
      return false;
    }
    const email = account.emailAddress;
    const messageId = message.id;
    const cal = this.getCalendarByMessageId(messageId);
    if (!cal) {
      return null;
    }
    const e = cal.getFirstEvent();
    if (!e) {
      return null;
    }
    try {
      const newCal = Calender.parse(
        CalendarStore.replyTemplate({
          eventString: e.toString(),
          timezoneString: cal.getTimeZoneString(),
        }),
      );
      const replyEvent = newCal.getFirstEvent();
      replyEvent.created = Date.now() / 1000;
      let statusLabel = 'Accepted';
      if (reply === 1) {
        replyEvent.confirm(email);
      } else if (reply === 2) {
        replyEvent.cancel(email);
        statusLabel = 'Declined';
      } else if (reply === 3) {
        replyEvent.tentative(email);
        statusLabel = 'Tentative';
      }
      const organizer = replyEvent.organizer;
      let me = replyEvent.findAttendeeByEmail(email);
      if (!Array.isArray(me)) {
        return null;
      } else {
        me = me[0];
      }
      if (!organizer) {
        return null;
      }
      AttachmentStore.createNewFile({
        extension: 'ics',
        data: newCal.toString(),
        inline: true,
        contentType: 'text/CALENDAR',
      }).then(newFile => {
        DraftFactory.createReplyForEvent({
          message,
          file: newFile,
          replyStatus: { label: statusLabel, code: reply },
          replyEvent,
          tos: [Contact.fromObject(organizer, { accountId: message.accountId })],
          me,
        }).then(newMessage => {

          Actions.queueTask(
            new CalendarTask({
              accountId: message.accountId,
              messageId: message.id,
              draft: newMessage,
              targetStatus: reply,
            }),
          );
        });
      });
    } catch (e) {
      AppEnv.reportError(e);
      return null;
    }
  }

  _onMessageDataChange = change => {
    if (change.objectClass === Message.name) {
      if (change.objects.length === 1 && change.objects[0].draft === true) {
        const item = change.objects[0];
        const itemIndex = Object.keys(this._calendarCache).indexOf(item.id);

        if (change.type === 'unpersist' && itemIndex !== -1) {
          this._removeMessage(item);
          this.trigger();
        }
      }
    } else if (change.objectClass === Thread.name) {
      const updatedThread = change.objects.find(t => t.id === this._currentThreadId);
      if (updatedThread) {
        if (change.type === 'unpersist') {
          this._calendarCache = {};
          this._processingQueue = {};
          this._currentThreadId = '';
        }
      }
    }
  };

  _onMessageStoreChange = () => {
    const newThreadId = MessageStore.threadId();
    if (newThreadId) {
      if (this._currentThreadId !== newThreadId) {
        this._currentThreadId = newThreadId;
        this._calendarCache = {};
        this._processingQueue = {};
      }
      this._parseMessages();
    }
  };

  _parseMessages() {
    MessageStore.getAllItems().forEach(this._updateCache);
  }

  _updateCache = (message) => {
    if (message.hasCalendar) {
      this._processMessage(message);
    }
  };

  _processMessage(message) {
    if (!this._isMessageInCache(message.id)) {
      let file = null;
      for (const f of message.files) {
        if (f.id === message.calendarFileId) {
          file = f;
          break;
        }
      }
      this._calendarCache[message.id] = {
        processing: false,
        file,
        currentStatus: message.calendarCurrentStatus,
        targetStatus: message.calendarTargetStatus,
        calendar: null,
      };
    }
    if (
      (!this._calendarCache[message.id].processing ||
        !this._calendarCache[message.id].calendar) &&
      this._calendarCache[message.id].file
    ) {
      this._calendarCache[message.id].processing = true;
      this._readCalendarFile(message.id)
        .then(iCal => {
          if (this._calendarCache[message.id]) {
            this._calendarCache[message.id].calendar = iCal;
            this._calendarCache[message.id].processing = false;
            if (iCal) {
              this.trigger();
            }
            this._popQueue(message.id);
          }
        })
        .catch(e => {
          if (this._calendarCache[message.id]) {
            this._calendarCache[message.id].processing = false;
            this._popQueue(message.id);
          }
        });
    } else if (this._calendarCache[message.id].processing) {
      this._addToQueue(message, 'process');
    }
  }

  _removeMessage(message) {
    if (this._calendarCache[message.id]) {
      if (!this._calendarCache[message.id].processing) {
        this._calendarCache[message.id].processing = true;
        delete this._calendarCache[message.id];
        this._popQueue(message.id);
      } else {
        this._addToQueue(message, 'remove');
      }
    }
  }

  _popQueue(messageId) {
    const queue = this._processingQueue[messageId];
    delete this._processingQueue[messageId];
    if (queue) {
      const queueMessage = queue.message;
      const cacheMessage = this._calendarCache[messageId];
      if (queueMessage && !cacheMessage.calendar) {
        if (queue.action === 'process') {
          this._processMessage(queueMessage);
        } else if (queue.action === 'remove') {
          this._removeMessage(queueMessage.id);
        }
        this.trigger();
      }
    }
  }

  _addToQueue(message, action) {
    this._processingQueue[message.id] = { message, action };
  }

  _readCalendarFile(messageId) {
    return new Promise(resolve => {
      if (!this._calendarCache[messageId]) {
        resolve(null);
        return;
      }
      if (!this._calendarCache[messageId].file) {
        resolve(null);
        return;
      }
      const tmpPath = AttachmentStore.pathForFile(this._calendarCache[messageId].file);
      if (!tmpPath) {
        resolve(null);
        return;
      }
      fs.readFile(tmpPath, 'utf8', (err, data) => {
        if (err) {
          resolve(null);
        } else {
          let iCal = null;
          try {
            iCal = Calender.parse(data);
          } finally {
            resolve(iCal);
          }
        }
      });
    });
  }

  _isMessageInCache(messageId) {
    return !!this._calendarCache[messageId];
  }

}

export default new CalendarStore();
