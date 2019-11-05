import {
  DefaultMailClientItem,
  LaunchSystemStartItem,
  DefaultAccountSending,
  DownloadSelection,
} from './components/preferences-general-components';
import PreferencesAccounts from './components/preferences-accounts';
import {
  AppearanceScaleSlider,
  AppearanceProfileOptions,
  AppearancePanelOptions,
  AppearanceThemeSwitch,
} from './components/preferences-appearance-components';
import {
  CustomizeQuickActions,
  CustomizeSwipeActions,
} from './components/preferences-customize-components';
import BlockedSenders from './components/preferences-blocked-senders';
import { Privacy } from './components/preferences-privacy-components';
import {
  PreferencesKeymapsHearder,
  PreferencesKeymapsContent,
} from './components/preferences-keymaps';

const preferencesTemplateFill = {
  tables: [
    {
      tabId: 'General',
      displayName: 'General',
      className: 'container-general',
      order: 1,
      configGroup: configSchema => [
        {
          groupName: 'EMAIL',
          groupItem: [
            {
              label: 'Make Edison Mail your default mail client',
              component: DefaultMailClientItem,
            },
            {
              label: 'Launch on system start',
              component: LaunchSystemStartItem,
            },
            {
              label: 'Show icon in menu bar',
              configSchema: configSchema.properties.workspace.properties.systemTray,
              keyPath: 'core.workspace.systemTray',
            },
            {
              label: 'Enable Focused Inbox (only show important senders in your inbox)',
              configSchema: configSchema.properties.workspace.properties.focusedInbox,
              keyPath: 'core.workspace.focusedInbox',
            },
            {
              label: 'Show important markers (Gmail only)',
              configSchema: configSchema.properties.workspace.properties.showImportant,
              keyPath: 'core.workspace.showImportant',
            },
            {
              label: 'Show unread count for all folders',
              configSchema: configSchema.properties.workspace.properties.showUnreadForAllCategories,
              keyPath: 'core.workspace.showUnreadForAllCategories',
            },
            {
              label: 'Use 24-hour clock',
              configSchema: configSchema.properties.workspace.properties.use24HourClock,
              keyPath: 'core.workspace.use24HourClock',
            },
            {
              label: 'Send new mail from',
              component: DefaultAccountSending,
              configSchema: configSchema,
            },
            {
              label: 'Send mail sound',
              configSchema: configSchema.properties.sending.properties.sounds,
              keyPath: 'core.sending.sounds',
            },
            {
              label: 'New mail sound',
              configSchema: configSchema.properties.notifications.properties.sounds,
              keyPath: 'core.notifications.sounds',
            },
            {
              label: 'Undo time window',
              configSchema: configSchema.properties.sending.properties.undoSend,
              keyPath: 'core.sending.undoSend',
            },
          ],
        },
        {
          groupName: 'READING & RESPONDING',
          groupItem: [
            {
              label: 'When reading messages, mark as read after',
              configSchema: configSchema.properties.reading.properties.markAsReadDelay,
              keyPath: 'core.reading.markAsReadDelay',
            },
            {
              label: 'Automatically load images in open emails',
              configSchema: configSchema.properties.reading.properties.autoloadImages,
              keyPath: 'core.reading.autoloadImages',
            },
            {
              label: 'Use the backspace/delete key to move emails to the trash',
              configSchema: configSchema.properties.reading.properties.backspaceDelete,
              keyPath: 'core.reading.backspaceDelete',
            },
            {
              label: 'Display conversations in descending chronological order',
              configSchema: configSchema.properties.reading.properties.descendingOrderMessageList,
              keyPath: 'core.reading.descendingOrderMessageList',
            },
            {
              label: 'Check messages for spelling',
              configSchema: configSchema.properties.composing.properties.spellcheck,
              keyPath: 'core.composing.spellcheck',
            },
            {
              label: 'Default spellcheck language',
              configSchema: configSchema.properties.composing.properties.spellcheckDefaultLanguage,
              keyPath: 'core.composing.spellcheckDefaultLanguage',
            },
          ],
        },
        {
          groupName: 'MESSAGES/CHAT',
          groupItem: [
            {
              label: 'Enable chat feature',
              configSchema: configSchema.properties.workspace.properties.enableChat,
              keyPath: 'core.workspace.enableChat',
            },
          ],
        },
        {
          groupName: 'DOWNLOADS',
          groupItem: [
            {
              label: 'Open containing folder after downloading attachments',
              configSchema: configSchema.properties.attachments.properties.openFolderAfterDownload,
              keyPath: 'core.attachments.openFolderAfterDownload',
            },
            {
              label: 'Display thumbnails for attachments when available (Mac only)',
              configSchema: configSchema.properties.attachments.properties.displayFilePreview,
              keyPath: 'core.attachments.displayFilePreview',
            },
            {
              label: 'Save downloaded files to',
              component: DownloadSelection,
              keyPath: 'core.attachments.downloadFolder',
            },
          ],
        },
      ],
    },
    {
      tabId: 'Notifications',
      displayName: 'Notifications',
      order: 2,
      configGroup: configSchema => [
        {
          groupName: 'EMAIL NOTIFICATIONS',
          groupItem: [
            {
              label: 'Show notifications for new unread emails',
              configSchema: configSchema.properties.notifications.properties.enabled,
              keyPath: 'core.notifications.enabled',
            },
            {
              label: 'Dock badge count',
              configSchema: configSchema.properties.notifications.properties.countBadge,
              keyPath: 'core.notifications.countBadge',
            },
          ],
        },
      ],
    },
    {
      tabId: 'Accounts',
      displayName: 'Accounts',
      order: 3,
      configGroup: configSchema => [
        {
          groupItem: [
            {
              label: 'Accounts',
              component: PreferencesAccounts,
            },
          ],
        },
      ],
    },
    {
      tabId: 'Appearance',
      displayName: 'Appearance',
      className: 'container-appearance',
      order: 4,
      configGroup: configSchema => [
        {
          groupName: 'LAYOUT',
          groupItem: [
            {
              label: 'Profile pictures',
              component: AppearanceProfileOptions,
            },
            {
              label: 'Panel',
              component: AppearancePanelOptions,
            },
          ],
        },
        {
          groupName: 'THEME',
          groupItem: [
            {
              label: 'Theme',
              component: AppearanceThemeSwitch,
            },
          ],
        },
        {
          groupName: 'SCALING',
          groupItem: [
            {
              label: 'AppearanceScaleSlider',
              component: AppearanceScaleSlider,
            },
          ],
        },
      ],
    },
    {
      tabId: 'Customize Actions',
      displayName: 'Customize Actions',
      className: 'container-customize-actions',
      order: 5,
      configGroup: configSchema => [
        {
          groupName: 'Quick Actions',
          groupItem: [
            {
              label: 'Show quick actions when hovering over emails in your list',
              configSchema: configSchema.properties.quickActions.properties.enabled,
              keyPath: 'core.quickActions.enabled',
            },
            {
              label: 'Show preview image',
              keyPath: 'core.quickActions.image',
              component: CustomizeQuickActions,
            },
            {
              label: 'Action 1',
              configSchema: configSchema.properties.quickActions.properties.quickAction1,
              keyPath: 'core.quickActions.quickAction1',
            },
            {
              label: 'Action 2',
              configSchema: configSchema.properties.quickActions.properties.quickAction2,
              keyPath: 'core.quickActions.quickAction2',
            },
            {
              label: 'Action 3',
              configSchema: configSchema.properties.quickActions.properties.quickAction3,
              keyPath: 'core.quickActions.quickAction3',
            },
            {
              label: 'Action 4',
              configSchema: configSchema.properties.quickActions.properties.quickAction4,
              keyPath: 'core.quickActions.quickAction4',
            },
          ],
        },
        {
          groupName: 'Swipe Actions',
          groupItem: [
            {
              label: 'Enable swipe actions',
              configSchema: configSchema.properties.swipeActions.properties.enabled,
              keyPath: 'core.swipeActions.enabled',
            },
            {
              label: 'Show preview image',
              keyPath: 'core.swipeActions.image',
              component: CustomizeSwipeActions,
            },
            {
              label: 'Left short swipe',
              configSchema: configSchema.properties.swipeActions.properties.leftShortAction,
              keyPath: 'core.swipeActions.leftShortAction',
            },
            {
              label: 'Left long swipe',
              configSchema: configSchema.properties.swipeActions.properties.leftLongAction,
              keyPath: 'core.swipeActions.leftLongAction',
            },
            {
              label: 'Right Short swipe',
              configSchema: configSchema.properties.swipeActions.properties.rightShortAction,
              keyPath: 'core.swipeActions.rightShortAction',
            },
            {
              label: 'Right Long swipe',
              configSchema: configSchema.properties.swipeActions.properties.rightLongAction,
              keyPath: 'core.swipeActions.rightLongAction',
            },
          ],
        },
      ],
    },
    {
      tabId: 'Shortcuts',
      displayName: 'Shortcuts',
      className: 'container-keymaps',
      order: 6,
      configGroup: configSchema => [
        {
          groupName: 'SHORTCUTS',
          groupItem: [
            {
              label: 'SHORTCUTS',
              component: PreferencesKeymapsHearder,
            },
          ],
        },
        ...PreferencesKeymapsContent(),
      ],
    },
    {
      tabId: 'Blocked Senders',
      displayName: 'Blocked Senders',
      order: 129,
      configGroup: configSchema => [
        {
          groupItem: [
            {
              label: 'BlockedSenders',
              component: BlockedSenders,
            },
          ],
        },
      ],
    },
    {
      tabId: 'Privacy',
      displayName: 'Privacy',
      order: 130,
      configGroup: configSchema => [
        {
          groupItem: [
            {
              label: 'Privacy',
              component: Privacy,
            },
          ],
        },
      ],
    },
  ],
};

export default preferencesTemplateFill;
