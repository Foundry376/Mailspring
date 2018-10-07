import url from 'url';
import querystring from 'querystring';
import { ipcRenderer } from 'electron';
import fs from 'fs';
import {
  localized,
  IdentityStore,
  DatabaseStore,
  Thread,
  Matcher,
  Message,
  Actions,
  AttachmentStore,
  SyncbackMetadataTask,
  MailspringAPIRequest,
  QuotedHTMLTransformer,
  ComponentRegistry,
} from 'mailspring-exports';

import plugin from '../package.json';
import ThreadSharingButton from './thread-sharing-button';

export const PLUGIN_NAME = plugin.title;
export const PLUGIN_ID = plugin.name;

const DATE_EPSILON = 60; // Seconds

const _readFile = Promise.promisify(fs.readFile);

const _parseOpenThreadUrl = nylasUrlString => {
  const parsedUrl = url.parse(nylasUrlString);
  const params = querystring.parse(parsedUrl.query);
  params.lastDate = parseInt(params.lastDate, 10);
  return params;
};

const _findCorrespondingThread = ({ subject, lastDate }, dateEpsilon = DATE_EPSILON) => {
  return DatabaseStore.findBy(Thread).where([
    Thread.attributes.subject.equal(subject),
    new Matcher.Or([
      new Matcher.And([
        Thread.attributes.lastMessageSentTimestamp.lessThan(lastDate + dateEpsilon),
        Thread.attributes.lastMessageSentTimestamp.greaterThan(lastDate - dateEpsilon),
      ]),
      new Matcher.And([
        Thread.attributes.lastMessageReceivedTimestamp.lessThan(lastDate + dateEpsilon),
        Thread.attributes.lastMessageReceivedTimestamp.greaterThan(lastDate - dateEpsilon),
      ]),
    ]),
  ]);
};

const _onOpenThreadFromWeb = (event, nylasUrl) => {
  const { subject, lastDate } = _parseOpenThreadUrl(nylasUrl);

  _findCorrespondingThread({ subject, lastDate })
    .then(thread => {
      if (!thread) {
        throw new Error('Thread not found');
      }
      Actions.popoutThread(thread);
    })
    .catch(error => {
      AppEnv.reportError(error);
      AppEnv.showErrorDialog(localized(`The thread %@ does not exist in your mailbox!`, subject));
    });
};

const _onDatabaseChange = change => {
  if (change.type !== 'persist' || change.objectClass !== Thread.name) {
    return;
  }

  change.objects.forEach(async thread => {
    if (isShared(thread)) {
      syncThreadToWebSoon(thread);
    }
  });
};

export function isShared(thread) {
  const metadata = thread.metadataForPluginId(PLUGIN_ID) || {};
  return metadata.shared || false;
}

export function sharingURLForThread(thread) {
  const metadata = thread.metadataForPluginId(PLUGIN_ID) || {};
  if (!metadata || !metadata.key || !metadata.shared) {
    return null;
  }
  const identity = IdentityStore.identity();
  return `https://shared.getmailspring.com/thread/${identity.id}/${metadata.key}`;
}

let soon = {};
let soonTimer = null;
const syncThreadToWebSoon = thread => {
  soon[thread.id] = thread;
  if (!soonTimer) {
    soonTimer = setTimeout(() => {
      const processing = Object.values(soon);
      soon = {};
      soonTimer = null;

      processing.forEach(async thread => {
        try {
          await syncThreadToWeb(thread);
        } catch (err) {
          console.warn(`Unable to sync thread '${thread.subject}' to the cloud: ${err}`);
        }
      });
    }, 5000);
  }
};

export const syncThreadToWeb = async thread => {
  const metadata = thread.metadataForPluginId(PLUGIN_ID) || {};

  let messages = await DatabaseStore.findAll(Message, {
    threadId: thread.id,
    accountId: thread.accountId,
  }).include(Message.attributes.body);

  // hide reminder notifications, deleted emails, etc.
  messages = messages.filter(m => !m.isHidden());

  const combinedVersionHash = messages.map(m => m.version).join('|');
  if (metadata.combinedVersionHash === combinedVersionHash) {
    // since thread sharing really just shows the messages in the thread, we don't need
    // to perform work (and could enter an infinite loop if we continue to update the metadata.)
    return;
  }

  // initialize, update the metadata value
  metadata.shared = true;
  metadata.combinedVersionHash = combinedVersionHash;
  metadata.key = metadata.key || `${thread.id}-${Date.now()}`;
  metadata.fileURLs = metadata.fileURLs || {};

  // first, sync any new attachments
  const files = messages.reduce((a, m) => a.concat(m.files), []);
  const toUpload = files.filter(f => !metadata.fileURLs[f.id]);
  while (toUpload.length) {
    const file = toUpload.pop();
    try {
      const filePath = AttachmentStore.pathForFile(file);
      const data = await _readFile(filePath);
      if (data.length === 0) {
        throw new Error(`File ${filePath} is not on disk.`);
      }
      const link = await MailspringAPIRequest.postStaticAsset({
        filename: `${file.id}/${file.displayName()}`,
        blob: new Blob([new Uint8Array(data)], { type: 'application/octet-stream' }),
      });
      metadata.fileURLs[file.id] = link;
    } catch (err) {
      console.log(`Could not upload attachment ${file.displayName()}: ${err}`);
    }
  }

  const { firstName, lastName, emailAddress } = IdentityStore.identity();

  // next, post the JSON for the entire thread
  await MailspringAPIRequest.postStaticAsset({
    filename: metadata.key,
    blob: JSON.stringify({
      thread: thread,
      sharedBy: { firstName, lastName, emailAddress },
      fileURLs: metadata.fileURLs,
      messages: messages.map(m =>
        Object.assign({}, m.toJSON(), {
          body: QuotedHTMLTransformer.removeQuotedHTML(m.body, {
            keepIfWholeBodyIsQuote: true,
          }),
        })
      ),
    }),
  });

  Actions.queueTask(
    SyncbackMetadataTask.forSaving({
      model: thread,
      pluginId: PLUGIN_ID,
      value: metadata,
    })
  );
};

export const unsyncThread = async thread => {
  const metadata = thread.metadataForPluginId(PLUGIN_ID) || {};
  await MailspringAPIRequest.postStaticAsset({
    filename: metadata.key,
    blob: JSON.stringify({ shared: false }),
  });

  Actions.queueTask(
    SyncbackMetadataTask.forSaving({
      model: thread,
      pluginId: PLUGIN_ID,
      value: { shared: false, key: metadata.key },
    })
  );
};
export function activate() {
  ComponentRegistry.register(ThreadSharingButton, {
    role: 'ThreadActionsToolbarButton',
  });
  this._unlisten = DatabaseStore.listen(_onDatabaseChange);
  ipcRenderer.on('openThreadFromWeb', _onOpenThreadFromWeb);
}

export function deactivate() {
  ComponentRegistry.unregister(ThreadSharingButton);
  ipcRenderer.removeListener('openThreadFromWeb', _onOpenThreadFromWeb);
  if (this._unlisten) {
    this._unlisten();
    this._unlisten = null;
  }
}
