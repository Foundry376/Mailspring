import path from 'path';
import fs from 'fs';
import tls from 'tls';
import net from 'net';
import MailspringStore from 'mailspring-store';
import { AccountStore } from './account-store';
import DatabaseStore from './database-store';
import TaskQueue from './task-queue';
import * as Actions from '../actions';
import { CrossAccountMoveFolderTask } from '../tasks/cross-account-move-folder-task';
import { GetMessageRFC2822Task } from '../tasks/get-message-rfc2822-task';
import { ChangeFolderTask } from '../tasks/change-folder-task';
import { Thread } from '../models/thread';
import { Message } from '../models/message';
import { Account } from '../models/account';
import CategoryStore from './category-store';
import KeyManager from '../../key-manager';

const IMAP_TIMEOUT_MS = 30000;

// Performs a raw IMAP APPEND of an RFC2822 message to a folder on the given account.
// Returns a Promise that resolves when the APPEND command completes.
function imapAppend(
  account: Account,
  folderPath: string,
  rfc2822: Buffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { imap_host, imap_port, imap_username, imap_security } = account.settings;
    const password = account.settings.imap_password;
    const useSSL = imap_security === 'SSL / TLS';
    const useSTARTTLS = imap_security === 'STARTTLS';

    let socket: net.Socket | tls.TLSSocket = null;
    let buffer = '';
    let commandTag = 1;
    let timer: ReturnType<typeof setTimeout> = null;
    let settled = false;

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    timer = setTimeout(() => settle(new Error('IMAP APPEND timed out')), IMAP_TIMEOUT_MS);

    const send = (cmd: string) => {
      socket.write(cmd + '\r\n');
    };

    const nextTag = () => `A${String(commandTag++).padStart(3, '0')}`;

    // State machine: greeting -> login -> select -> append -> done
    type State = 'greeting' | 'login' | 'append' | 'done';
    let state: State = 'greeting';
    let loginTag = '';
    let appendTag = '';

    const onLine = (line: string) => {
      if (state === 'greeting') {
        if (line.startsWith('* OK') || line.startsWith('* PREAUTH')) {
          if (useSTARTTLS) {
            // Upgrade to TLS before LOGIN
            const stlsTag = nextTag();
            send(`${stlsTag} STARTTLS`);
            state = 'starttls' as any;
            (socket as any)._starttlsTag = stlsTag;
          } else {
            // Send LOGIN
            loginTag = nextTag();
            const escapedUser = imap_username.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const escapedPass = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            send(`${loginTag} LOGIN "${escapedUser}" "${escapedPass}"`);
            state = 'login';
          }
        } else if (line.startsWith('* BYE') || line.includes('NO') || line.includes('BAD')) {
          settle(new Error(`IMAP greeting error: ${line}`));
        }
        return;
      }

      if ((state as any) === 'starttls') {
        const stlsTag = (socket as any)._starttlsTag;
        if (line.startsWith(`${stlsTag} OK`)) {
          // Upgrade the plain socket to TLS
          const upgraded = tls.connect({
            socket: socket as net.Socket,
            host: imap_host,
            rejectUnauthorized: !account.settings.imap_allow_insecure_ssl,
          });
          upgraded.on('data', onData);
          upgraded.on('error', err => settle(err));
          socket = upgraded;
          buffer = '';
          loginTag = nextTag();
          const escapedUser = imap_username.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const escapedPass = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          send(`${loginTag} LOGIN "${escapedUser}" "${escapedPass}"`);
          state = 'login';
        } else if (line.includes('NO') || line.includes('BAD')) {
          settle(new Error(`IMAP STARTTLS failed: ${line}`));
        }
        return;
      }

      if (state === 'login') {
        if (line.startsWith(`${loginTag} OK`)) {
          // Issue APPEND
          const escapedFolder = folderPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const byteCount = rfc2822.length;
          appendTag = nextTag();
          send(`${appendTag} APPEND "${escapedFolder}" {${byteCount}}`);
          state = 'append';
        } else if (line.startsWith(`${loginTag} NO`) || line.startsWith(`${loginTag} BAD`)) {
          settle(new Error(`IMAP LOGIN failed: ${line}`));
        }
        return;
      }

      if (state === 'append') {
        if (line.startsWith('+ ') || line === '+') {
          // Server ready for literal data
          socket.write(rfc2822);
          socket.write('\r\n');
        } else if (line.startsWith(`${appendTag} OK`)) {
          // APPEND succeeded — logout
          const logoutTag = nextTag();
          send(`${logoutTag} LOGOUT`);
          state = 'done';
          settle();
        } else if (
          line.startsWith(`${appendTag} NO`) ||
          line.startsWith(`${appendTag} BAD`)
        ) {
          settle(new Error(`IMAP APPEND failed: ${line}`));
        }
        return;
      }
    };

    const onData = (data: Buffer | string) => {
      buffer += data.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        if (line.length > 0) onLine(line);
      }
    };

    const connect = () => {
      if (useSSL) {
        socket = tls.connect(
          {
            host: imap_host,
            port: imap_port,
            rejectUnauthorized: !account.settings.imap_allow_insecure_ssl,
          },
          () => { }
        );
      } else {
        socket = net.connect({ host: imap_host, port: imap_port });
      }
      socket.on('data', onData);
      socket.on('error', err => settle(err));
      socket.on('close', () => {
        if (!settled) settle(new Error('IMAP connection closed unexpectedly'));
      });
    };

    connect();
  });
}

class CrossAccountMailStore extends MailspringStore {
  _processing: Set<string> = new Set();

  constructor() {
    super();
    // Only active in the main window which has the mailsync bridge
    if (!AppEnv.isMainWindow()) return;
    Actions.queueTask.listen(this._onTaskQueued, this);
    Actions.queueTasks.listen(this._onTasksQueued, this);
  }

  _onTasksQueued = (tasks: any[]) => {
    if (!tasks || !tasks.length) return;
    for (const task of tasks) {
      this._onTaskQueued(task);
    }
  };

  _onTaskQueued = (task: any) => {
    if (!(task instanceof CrossAccountMoveFolderTask)) return;
    // Intercept before the bridge sends it to the sync engine.
    // We handle it entirely in JS.
    this._executeCrossAccountMove(task);
  };

  async _executeCrossAccountMove(task: CrossAccountMoveFolderTask) {
    if (this._processing.has(task.id)) return;
    this._processing.add(task.id);

    try {
      // 1. Fetch full account with credentials
      const accountWithoutSecrets = AccountStore.accountForId(task.sourceAccountId);
      if (!accountWithoutSecrets) {
        throw new Error(
          `CrossAccountMailStore: source account ${task.sourceAccountId} not found`
        );
      }
      const targetAccountWithoutSecrets = AccountStore.accountForId(task.targetAccountId);
      if (!targetAccountWithoutSecrets) {
        throw new Error(
          `CrossAccountMailStore: target account ${task.targetAccountId} not found`
        );
      }

      // 2. Fetch Thread models to get their messages
      const threads = await DatabaseStore.modelify<Thread>(Thread, task.threadIds);
      if (!threads || threads.length === 0) {
        throw new Error('CrossAccountMailStore: no threads found for task');
      }

      // 3. Fetch all messages for these threads on the source account
      const allMessages: Message[] = [];
      for (const thread of threads) {
        const msgs = await DatabaseStore.findAll<Message>(Message, { threadId: thread.id });
        allMessages.push(...msgs.filter(m => !m.draft));
      }

      if (allMessages.length === 0) {
        throw new Error('CrossAccountMailStore: no messages found in source threads');
      }

      // 4. For each message, fetch the RFC2822 source via GetMessageRFC2822Task,
      //    then IMAP-APPEND it to the target folder.
      const targetAccount = await KeyManager.insertAccountSecrets(targetAccountWithoutSecrets);
      const tempDir = require('@electron/remote').app.getPath('temp');
      const folderPath = task.targetFolder.path;

      for (const message of allMessages) {
        const filepath = path.join(tempDir, `cross-account-${message.id}.eml`);

        // Queue GetMessageRFC2822Task on the SOURCE account
        const rfc2822Task = new GetMessageRFC2822Task({
          messageId: message.id,
          accountId: task.sourceAccountId,
          filepath,
        });
        Actions.queueTask(rfc2822Task);

        // Wait for the source account's sync engine to write the file
        await TaskQueue.waitForPerformRemote(rfc2822Task);

        // Read the RFC2822 file
        let raw: Buffer;
        try {
          raw = fs.readFileSync(filepath);
        } catch (e) {
          console.error(
            `CrossAccountMailStore: could not read RFC2822 file for message ${message.id}: ${e}`
          );
          continue;
        }

        // APPEND to the target IMAP server
        await imapAppend(targetAccount, folderPath, raw);

        // Clean up temp file
        try {
          fs.unlinkSync(filepath);
        } catch (_) {
          // ignore cleanup errors
        }
      }

      // 5. If deleteFromSource, trash all source threads
      if (task.deleteFromSource) {
        const trashFolder = CategoryStore.getTrashCategory(task.sourceAccountId);
        if (trashFolder) {
          const trashTask = new ChangeFolderTask({
            folder: trashFolder as any,
            threads,
            source: 'Cross-Account Move',
          });
          Actions.queueTask(trashTask);
        }
      }

      // Signal the mailsync bridge that this task is complete by NOT forwarding
      // it — we mark it done by having handled it. The bridge already called
      // willBeQueued(), which validates. Since we intercept via Actions.queueTask
      // listener BEFORE the bridge processes it, we need to prevent the bridge
      // from also sending it to the sync engine. This is done in mailsync-bridge.ts
      // (see CrossAccountMoveFolderTask guard added there).

      const verb = task.deleteFromSource ? 'moved' : 'copied';
      console.log(
        `CrossAccountMailStore: successfully ${verb} ${allMessages.length} message(s) to ${task.targetFolder.displayName}`
      );
    } catch (err) {
      console.error(`CrossAccountMailStore: cross-account move failed: ${err}`);
      AppEnv.showErrorDialog({
        title: 'Cross-Account Move Failed',
        message: `Could not copy messages to ${task.targetFolder ? task.targetFolder.displayName : 'the destination folder'
          }.\n\n${err.message}`,
      });
    } finally {
      this._processing.delete(task.id);
    }
  }
}

export default new CrossAccountMailStore();
