import keyMannager from '../../../src/key-manager'
const { get, post } = require('./httpex')
let myApps = {}
let otherApps = {}

// --------------for chat platform------------
const appBaseUrl = 'https://cs.stag.easilydo.cc'
export const xmpplogin = (userId, token, cb) => {
  var url = appBaseUrl + '/auth/public/xmpplogin'
  post(url, { userId, token }, cb)
}
export const getMyAppByShortName = (userId, shortName) => {
  let arr = []
  // console.log(userId, shortName, myApps)
  if (myApps[userId] && myApps[userId].apps) {
    const apps = myApps[userId].apps
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].shortName == shortName) {
        arr.push(apps[i])
      }
    }
  } else if (!myApps[userId] || !myApps[userId].apps) {
    getToken(userId)
      .then(data => {
        iniApps(userId, data)
      })
      .catch(err => {
        console.warn(err)
      })
  }
  return arr
}
export const getMyAppById = (userId, id) => {
  if (myApps[userId] && myApps[userId].apps) {
    const apps = myApps[userId].apps
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].id == id) {
        return apps[i]
      }
    }
  } else if (!myApps[userId] || !myApps[userId].apps) {
    getToken(userId)
      .then(data => {
        iniApps(userId, data)
      })
      .catch(err => {
        console.warn(err)
      })
  }
  return null
}
export const getToken = async userId => {
  const chatAccounts = AppEnv.config.get('chatAccounts')
  for (const email in chatAccounts) {
    if (chatAccounts[email].userId === userId) {
      if (!myApps[userId]) {
        myApps[userId] = { name: chatAccounts[email].name }
      } else {
        myApps[userId].name = chatAccounts[email].name
      }
      return await keyMannager.getAccessTokenByEmail(email)
    }
  }
}
/**
 * initialize my apps
 * @param userId
 * @param token
 */
export const iniApps = (userId, token, cb) => {
  if (!token) {
    token = 'AhU0sbojRdafuHUV-ESofQ'
  }
  let url = appBaseUrl + '/xmpp/client/listApps'
  let version
  if (myApps[userId]) {
    version = myApps[userId].version
  }
  post(url, { userId, token, version }, (err, data) => {
    if (data) {
      let json
      try {
        json = JSON.parse(data)
      } catch (e) {
        console.warn('iniApps: failed: json parse error: ', userId, e)
        return
      }
      if (json.code == 0 && json.data.apps && json.data.apps.length > 0) {
        if (!myApps[userId]) {
          myApps[userId] = {}
        }
        myApps[userId].apps = json.data.apps
        myApps[userId].version = json.data.version
      }
      if (cb) {
        myApps[userId] && cb(myApps[userId].apps)
      }
    } else {
      console.log('iniApps: failed: ', userId, err)
    }
  })
}
export const getApp = (userId, appId, token, cb) => {
  let app = otherApps[appId]
  if (app) {
    cb(null, app)
    return
  }
  var url = appBaseUrl + '/xmpp/client/appInfo'
  post(url, { userId, appId, token }, (err, data) => {
    if (data) {
      let json = JSON.parse(data)
      if (json.code == 0 && json.data.app) {
        otherApps[appId] = json.data.app
        cb(null, json.data.app)
        return
      } else {
        console.log(json)
      }
    } else {
      console.log(err)
    }
    cb(err)
  })
}
export const listKeywordApps = (userId, token, cb) => {
  var url = appBaseUrl + '/xmpp/client/listKeywordApps'
  post(url, { userId, token }, cb)
}
export const sendMsg2App = (data, cb) => {
  var url = appBaseUrl + '/xmpp/client/sendMessage'
  if (!data.userName) {
    data.userName = myApps[userId].name
  }
  post(url, data, cb)
}
export const sendMsg2App2 = (userId, userName, token, appId, content, cb) => {
  if (!userName && myApps[userId]) {
    userName = myApps[userId].name
  }
  sendMsg2App({ userId, userName, token, appId, content }, cb)
}
export const sendCmd2App = (data, cb) => {
  var url = appBaseUrl + '/xmpp/client/sendCommand'
  if (!data.userName) {
    data.userName = myApps[userId].name
  }
  post(url, data, cb)
}
export const sendCmd2App2 = (userId, userName, token, appId, command, peerUserId, roomId, cb) => {
  if (!userName) {
    userName = myApps[userId].name
  }
  sendCmd2App({ userId, userName, token, appId, command, peerUserId, roomId }, cb)
}
export const removeMyApps = userId => {
  if (userId) {
    if (myApps[userId]) {
      myApps[userId] = null
    }
  }
}
export const getMyApps = userId => {
  if (userId) {
    if (!myApps[userId] || !myApps[userId].apps) {
      getToken(userId)
        .then(data => {
          iniApps(userId, data)
        })
        .catch(err => {
          console.warn(err)
        })
      return {}
    } else {
      return myApps[userId]
    }
  } else {
    return myApps
  }
}
export const getAppByJid = jid => {
  const atIndex = jid.indexOf('@')
  const id = jid.substr(0, atIndex)
  if (otherApps[id]) {
    return otherApps[id]
  }

  if (!myApps) {
    return null
  }

  let userId
  for (userId in myApps) {
    const info = myApps[userId]
    if (!info) {
      continue
    }
    for (const app of info.apps) {
      if (app.jid === jid || app.id === id) {
        return app
      }
    }
  }
}
// --------------for chat platform------------

export default {
  xmpplogin,
  iniApps,
  listKeywordApps,
  sendMsg2App,
  getApp,
  getToken,
  sendMsg2App2,
  sendCmd2App,
  sendCmd2App2,
  getMyAppByShortName,
  getMyAppById,
  getAppByJid,
  getMyApps
}
