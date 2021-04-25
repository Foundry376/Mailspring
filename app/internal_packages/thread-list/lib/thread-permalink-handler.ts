import url from 'url';
import querystring from 'querystring';
import { ipcRenderer } from 'electron';
import { localized, DatabaseStore, Thread, Matcher, Actions } from 'mailspring-exports';

const DATE_EPSILON = 60; // Seconds

interface MailspringLinkParams {
  subject: string;
  lastDate?: number;
  date?: number;
}

const _parseOpenThreadUrl = (mailspringUrlString: string) => {
  const parsedUrl = url.parse(mailspringUrlString);
  const params = querystring.parse(parsedUrl.query) as any;
  return {
    subject: params.subject,
    date: params.date ? parseInt(params.date, 10) : undefined,
    lastDate: params.lastDate ? parseInt(params.lastDate, 10) : undefined,
  } as MailspringLinkParams;
};

const _findCorrespondingThread = (
  { subject, lastDate, date }: MailspringLinkParams,
  dateEpsilon = DATE_EPSILON
) => {
  const dateClause = date
    ? new Matcher.And([
        Thread.attributes.firstMessageTimestamp.lessThan(date + dateEpsilon),
        Thread.attributes.firstMessageTimestamp.greaterThan(date - dateEpsilon),
      ])
    : new Matcher.Or([
        new Matcher.And([
          Thread.attributes.lastMessageSentTimestamp.lessThan(lastDate + dateEpsilon),
          Thread.attributes.lastMessageSentTimestamp.greaterThan(lastDate - dateEpsilon),
        ]),
        new Matcher.And([
          Thread.attributes.lastMessageReceivedTimestamp.lessThan(lastDate + dateEpsilon),
          Thread.attributes.lastMessageReceivedTimestamp.greaterThan(lastDate - dateEpsilon),
        ]),
      ]);

  return DatabaseStore.findBy<Thread>(Thread).where([
    Thread.attributes.subject.equal(subject),
    dateClause,
  ]);
};

const _onOpenThreadFromWeb = (event, mailspringUrl: string) => {
  const params = _parseOpenThreadUrl(mailspringUrl);

  _findCorrespondingThread(params)
    .then(thread => {
      if (!thread) {
        throw new Error('Thread not found');
      }
      Actions.popoutThread(thread);
    })
    .catch(error => {
      AppEnv.reportError(error);
      AppEnv.showErrorDialog(
        localized(`The thread %@ does not exist in your mailbox!`, params.subject)
      );
    });
};

export function activate() {
  ipcRenderer.on('openThreadFromWeb', _onOpenThreadFromWeb);
}
