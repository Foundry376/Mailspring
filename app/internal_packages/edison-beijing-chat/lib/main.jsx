import ChatButton from './chat-button';
import ChatView from './chat-view';
import ChatViewLeft from './chat-view-left';
import ChatAccountSidebarFiller from '../chat-components/components/chat/chat-account-sidebar-filler';
import { LocalStorage } from 'chat-exports';
const { ComponentRegistry, WorkspaceStore } = require('mailspring-exports');
import '../model/';
import startXmpp from '../xmpp/startXmpp';

const osLocale = require('os-locale');

const CHAT_COUNTRIES = [
  "CN"
];
function isChatTestUser() {
  // let locale = osLocale.sync();
  // if (locale.indexOf('_') !== -1) {
  //   locale = locale.split('_')[1];
  // }
  // return CHAT_COUNTRIES.indexOf(locale) !== -1;
  return true;
}

const isChatTest = isChatTestUser();

module.exports = {
  activate() {
    if (AppEnv.config.get(`chatEnable`)) {
      startXmpp(xmpp);
      WorkspaceStore.defineSheet('ChatView', { root: true }, {
        list: ['RootSidebar', 'ChatView'],
        split: ['RootSidebar', 'ChatView']
      });
      const { devMode } = AppEnv.getLoadSettings();
      LocalStorage.loadFromLocalStorage();
      window.edisonChatServerDiffTime = 0;
      if (true || devMode || isChatTest) {
        ComponentRegistry.register(ChatView, { location: WorkspaceStore.Location.ChatView });
        if (AppEnv.isMainWindow()) {
          ComponentRegistry.register(ChatButton, {
            location: WorkspaceStore.Location.RootSidebar.Toolbar,
          });
          ComponentRegistry.register(ChatViewLeft, {
            location: WorkspaceStore.Sheet.Global.Footer,
          });
          ComponentRegistry.register(ChatAccountSidebarFiller, {
            location: WorkspaceStore.Location.RootSidebar,
          });
        }
        // else {
        //   AppEnv.getCurrentWindow().setMinimumSize(800, 600);
        //   ComponentRegistry.register(ChatView, {
        //     location: WorkspaceStore.Location.Center,
        //   });
        // }
      }
    }
  },

  deactivate() {
    if (AppEnv.config.get(`chatEnable`)) {
      const { devMode } = AppEnv.getLoadSettings();
      if (true || devMode || isChatTest) {
        if (AppEnv.isMainWindow()) {
          ComponentRegistry.unregister(ChatButton);
          ComponentRegistry.unregister(ChatViewLeft);
          ComponentRegistry.unregister(ChatAccountSidebarFiller);
        } else {
          ComponentRegistry.unregister(ChatView);
        }
      }
    }
  }

};
