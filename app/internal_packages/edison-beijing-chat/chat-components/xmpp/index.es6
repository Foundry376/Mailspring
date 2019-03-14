import Stanza, { Client } from '../../../../src/xmpp/stanza.io';
import EventEmitter3 from 'eventemitter3';
import { Observable } from 'rxjs/Observable';
import chatModel from '../store/model';

/**
 * The interval between requests to join rooms
 */
const JOIN_INTERVAL = 5;

export class Xmpp extends EventEmitter3 {
  defaultJid;
  xmppMap = {};
  init(credentials) {
    let jid = credentials.jid;
    if (jid.indexOf('/') > 0) {
      jid = jid.substring(0, jid.indexOf('/'));
    }
    let xmpp = this.xmppMap[jid];
    if (!xmpp) {
      xmpp = new XmppEx();
      this.xmppMap[jid] = xmpp;
      this.defaultJid = jid;
    }
    xmpp.init(credentials);
    xmpp.client.on('*', (name, data) => {
      if (data && typeof data != "string") {
        data.curJid = xmpp.connectedJid;
      }
      this.emit(name, data);
    });
    xmpp.client.on('memberschange', (data) => {
      this.emit(name, data);
    });
  }
  connect(jid) {
    let xmpp = this.getXmpp(jid);
    console.log(xmpp);
    return xmpp.connect();
  }
  getXmpp(jid) {
    if (jid && jid.indexOf('/') > 0) {
      jid = jid.substring(0, jid.indexOf('/'));
    }
    if (jid) {
      return this.xmppMap[jid] || this.xmppMap[this.defaultJid];
    } else {
      return this.xmppMap[this.defaultJid];
    }
  }
  async enableCarbons(curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.enableCarbons();
  }
  async getRoster(curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.getRoster();
  }
  async getE2ee(user, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.getE2ee(user);
  }
  async setE2ee(user, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.setE2ee(user);
  }
  async setRoomName(room, opts, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.setRoomName(room, opts);
  }
  async setNickName(room, nick, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.setNickName(room, nick);
  }
  async addMember(room, jid, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.addMember(room, jid);
  }
  async leaveRoom(room, jid, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.leaveRoom(room, jid);
  }
  async destroyRoom(room, reason, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.destroyRoom(room, reason);
  }
  async createRoom(room, opts, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.createRoom(room, opts);
  }
  async getRoomMembers(room, ver, curJid) {
    let xmpp = this.getXmpp(curJid);
    if (!xmpp) {
      console.warn(`the xmpp connection of ${curJid} is not exist, maybe you just delete this account.`);
      return {
        mucAdmin: {
          items: []
        }
      };
    }
    return xmpp.getRoomMembers(room, ver);
  }
  async getRoomList(ver, curJid) {
    let xmpp = this.getXmpp(curJid);
    const result = xmpp.getRoomList(ver);
    console.log('dbg*** xmpp.getRoomList: ', result);
    return result;
  }
  async block(jid, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.block(jid);
  }
  async unblock(jid, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.unblock(jid);
  }
  async getBlocked(ver, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.getBlocked(ver);
  }
  async joinRooms(curJid,
    ...roomJids) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.joinRooms(...roomJids);
  }
  async pullMessage(ts, curJid) {
    let xmpp = this.getXmpp(curJid);
    return xmpp.pullMessage(ts);
  }
  sendMessage(message, curJid) {
    let xmpp = this.getXmpp(curJid);
    xmpp.sendMessage(message);
  }
}

/**
 * A class that interfaces with the Quickblox REST API
 * @extends EventEmitter3
 */
export class XmppEx extends EventEmitter3 {
  isConnected = false;
  client = null;
  credentials = null;
  connectedJid = null;
  retryTimes = 0;
  correctionTime = 0;

  /**
   * Initializes the QuickBlox instance's credentials.
   * @param {Object} credentials The xmpp credentials, consisting of an jid (string), password
   *                             (string), transport (string), wsURL (string), and boshURL (string)
   * @throws {Error}             Throws an error if the credentials are do not pass validation
   */
  init(credentials) {
    validateCredentials(credentials);
    if (this.client) {
      this.client.disconnect();
    }
    this.credentials = credentials;
    this.connectedJid = credentials.jid;
    this.client = Stanza.createClient(credentials);
    this.client.on('*', (name, data) => {
      if (name != 'disconnected') {
        this.emit(name, data)
      }
    });
    this.client.on('session:started', () => {
      this.retryTimes = 0;
      this.isConnected = true;
      this.client.sendPresence();
      //this.client.enableKeepAlive({ timeout: 300, interval: 300 });
      // the code below seems to be a more stable replacement:
      setInterval(() => {
        this.client.ping(this.connectedJid);
      }, 50000);
    });
    this.client.on('session:prebind', (bind) => {
      chatModel.diffTime = parseInt(bind.serverTimestamp)
        - (new Date().getTime() - parseInt(bind.timestamp)) / 2 - parseInt(bind.timestamp);
      console.log('session:prebind', bind, chatModel.diffTime);
    });
    this.client.on('disconnected', () => {
      console.warn('disconnected', this.connectedJid);
      this.isConnected = false;
      if (this.retryTimes == 0) {
        this.retryTimes++;
        setTimeout(() => this.connect(), 500);
      } else {
        this.emit('disconnected', this.connectedJid);
      }
    });
  }

  /**
   * Connects to the xmpp service. Requires the instance to be initialized.
   * @throws  {Error}             Throws an error if the instance has not been initialized
   * @returns {Promise.<Object>}  Returns a promise that resolves a JID object
   */
  connect() {
    if (this.client === null) {
      throw Error('Init this instance by calling init(credentials) before trying to connect');
    }

    const self = this;
    let isComplete = false;
    return new Promise((resolve, reject) => {
      const success = jid => {
        isComplete = true;
        removeListeners();
        resolve(jid);
      };
      const failure = () => {
        isComplete = true;
        removeListeners();
        reject();
      };
      setTimeout(() => {
        if (!isComplete) {
          removeListeners();
          self.client.disconnect();
          //reject('Connection timeout');
          console.log('Connection timeout');
        }
      }, 30000);
      const removeListeners = () => {
        self.removeListener('session:started', success);
        self.removeListener('auth:failed', failure);
      };

      self.on('session:started', success);
      self.on('auth:failed', failure);
      this.client.connect();
    });
  }

  /**
   * Enables carbons
   * @throws  {Error}             Throws an error if the client is not connected
   * @returns {Promise.<Object>}
   */
  async enableCarbons() {
    this.requireConnection();
    return this.client.enableCarbons();
  }

  /**
   * Retrieves the user's roster from the XMPP Server
   * @throws  {Error}               Throws an error if the client is not connected
   * @returns {Promise.<Object>}
   */
  async getRoster() {
    this.requireConnection();
    return this.client.getRoster();
  }

  async getE2ee(user) {//yazzxx
    this.requireConnection();
    return this.client.getE2ee(user);
  }
  async setE2ee(user) {//yazzxx
    this.requireConnection();
    return this.client.setE2ee(user);
  }

  //------------------room start
  /**
   *
   * @param room
   * @param opts { name:'room name', subject:'subject', description:'description'}
   */
  async setRoomName(room, opts) {
    return this.client.setRoomName(room, opts);
  }
  async setNickName(room, nick) {
    return this.client.setNickName(room, nick);
  }
  async addMember(room, jid) {
    return this.client.addMember(room, jid);
  }
  async leaveRoom(room, jid) {
    return this.client.leaveRoom(room, jid);
  }
  async destroyRoom(room, reason) {
    return this.client.destroyRoom(room, { reason: reason });
  }
  /**
   *
   * @param room
   * @param opts
   * {
   *    type:'create',
   *    name:'yazz_test',
   *    subject:'yazz test',
   *    description:'description',
   *    members:{
   *        jid:['100004@im.edison.tech','100007@im.edison.tech','1000@im.edison.tech']
   *    }
   * }
   */
  async createRoom(room, opts) {
    return this.client.createRoom(room, opts);
  }
  async getRoomMembers(room, ver) {
    try {
      const members = await this.client.getRoomMembers(room, {
        ver: ver,
        items: [{
          affiliation: 'member'
        }]
      });
      this.emit('receive:members', members);
      return members;
    } catch (err) {
      console.warn('getRoomMembers failed, maybe you are not this room member', err);
      const emptyEmebers = {
        mucAdmin: {
          items: []
        }
      }
      this.emit('receive:members', emptyEmebers);
      return emptyEmebers;
    }
  }
  async getRoomList(ver) {
    return this.client.getRoomList(ver);
  }

  //----------------------room end

  //----------------------block start
  async block(jid) {
    return this.client.block(jid);
  }
  async unblock(jid) {
    return this.client.unblock(jid);
  }
  async getBlocked(ver) {
    return this.client.getBlocked(ver);
  }
  //----------------------block end

  /**
   * Joins the rooms with the provided Jids. Requires connection to server.
   * @param   {...string} roomJids  The jids of the rooms to join
   * @throws  {Error}               Throws an error if the client is not connected or if no jids are
   *                                provided
   * @returns {Promise.<string[]>}  The array of room jids that were successfully joined
   */
  async joinRooms(...roomJids) {
    this.requireConnection();
    if (roomJids.length === 0) {
      console.warn('At least 1 room jid is required');
    }
    const self = this;
    const incomplete = new Set(roomJids);
    return new Promise((resolve, reject) => {
      const onComplete = data => {
        const { from: { bare: joinedMuc } } = data;
        incomplete.delete(joinedMuc);
        if (incomplete.size === 0) {
          self.removeListener('muc:available', onComplete);
          resolve(roomJids);
        }
      };
      setTimeout(() => {
        if (incomplete.size > 0) {
          const successful = roomJids.filter(jid => !incomplete.has(jid));
          const failed = Array.from(incomplete);
          self.removeListener('muc:available', onComplete);
          reject({ successful, failed });
        }
      }, 2000 + (JOIN_INTERVAL * roomJids.length)); // 5 second timeout from the last attempt
      self.on('muc:available', onComplete);

      // Space requests 10ms apart to avoid congestion
      Observable.from(roomJids)
        .zip(Observable.interval(JOIN_INTERVAL), jid => jid)
        .subscribe(jid => this.client.joinRoom(jid));
    });
  }

  async pullMessage(ts) {
    return this.client.pullMessage(ts);
  }
  /**
   * Sends a message to the connected xmpp server
   * @param   {Object}  message   The message to be sent
   * @throws  {Error}             Throws an error if the client is not connected
   */
  sendMessage(message, retryCnt = 0) {
    let isConnected = false;
    try {
      isConnected = this.requireConnection();
    } catch (e) {
      console.warn(e);
    }
    if (!isConnected) {
      retryCnt++;
      if (retryCnt <= 10) {
        setTimeout(() => {
          this.connect().then(() => this.sendMessage(message, retryCnt));
        }, 100 + 1000 * (retryCnt - 1)); // 0.1s, 1.1s, 2.1s ...
      }
      return;
    }
    const finalMessage = Object.assign({}, message, {
      from: this.connectedJid,
      requestReceipt: true,
    });
    this.client.sendMessage(finalMessage);
  }

  requireConnection() {
    if (!this.isConnected || !(this.client instanceof Client)) {
      console.warn('This method requires a connection to the XMPP server, call connect before ' +
        'using this method.');
      return false;
    }
    return true;
  }
}

/**
 * Validates Xmpp credentials.
 * @param   {Object} credentials  The xmpp credentials, consisting of an jid (string), password
 *                                (string), transport (string), wsURL (string), and boshURL (string)
 * @throws  {Error}               Throws an error if the provided credentials object is not
 *                                properly formatted
 */
export const validateCredentials = credentials => {
  if (typeof credentials !== 'object') {
    throw Error('Credentials must be an object');
  }

  const problems = [];
  const { jid, password, transport, wsURL, boshURL } = credentials;
  if (typeof jid !== 'string') {
    problems.push("jid of type 'string' is required");
  }
  if (typeof password !== 'string') {
    problems.push("password of type 'string' is required");
  }
  const transports = ['bosh', 'websocket', 'old-websocket'];
  if (transports.indexOf(transport) < 0) {
    problems.push(`transport must be one of ${transports.join(', ')}`);
  }
  if (transport === 'bosh' && typeof boshURL !== 'string') {
    problems.push("boshURL of type 'string' is required");
  } else if ((transport === 'websocket' || transport === 'old-websocket')
    && typeof wsURL !== 'string') {
    problems.push("wsURL of type 'string' is required");
  }

  if (problems.length > 0) {
    throw Error(`Invalid credentials: ${problems.join(', ')}`);
  }
};

const xmpp = new Xmpp();
window.xmpp = xmpp;
export default xmpp;
