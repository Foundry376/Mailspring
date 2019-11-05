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
      configGroup: [
        {
          groupName: 'EMAIL',
          groupItem: [
            {
              label: 'Make Edison Mail your default mail client',
              component: DefaultMailClientItem,
              keywords: [],
            },
            {
              label: 'Launch on system start',
              component: LaunchSystemStartItem,
              keywords: [],
            },
            {
              label: 'Show icon in menu bar',
              configSchema: configSchema => configSchema.properties.workspace.properties.systemTray,
              keyPath: 'core.workspace.systemTray',
              keywords: [],
            },
            {
              label: 'Enable Focused Inbox (only show important senders in your inbox)',
              configSchema: configSchema =>
                configSchema.properties.workspace.properties.focusedInbox,
              keyPath: 'core.workspace.focusedInbox',
              keywords: [],
            },
            {
              label: 'Show important markers (Gmail only)',
              configSchema: configSchema =>
                configSchema.properties.workspace.properties.showImportant,
              keyPath: 'core.workspace.showImportant',
              keywords: [],
            },
            {
              label: 'Show unread count for all folders',
              configSchema: configSchema =>
                configSchema.properties.workspace.properties.showUnreadForAllCategories,
              keyPath: 'core.workspace.showUnreadForAllCategories',
              keywords: [],
            },
            {
              label: 'Use 24-hour clock',
              configSchema: configSchema =>
                configSchema.properties.workspace.properties.use24HourClock,
              keyPath: 'core.workspace.use24HourClock',
              keywords: [],
            },
            {
              label: 'Send new mail from',
              component: DefaultAccountSending,
              configSchema: configSchema => configSchema,
              keywords: [],
            },
            {
              label: 'Send mail sound',
              configSchema: configSchema => configSchema.properties.sending.properties.sounds,
              keyPath: 'core.sending.sounds',
              keywords: [],
            },
            {
              label: 'New mail sound',
              configSchema: configSchema => configSchema.properties.notifications.properties.sounds,
              keyPath: 'core.notifications.sounds',
              keywords: [],
            },
            {
              label: 'Undo time window',
              configSchema: configSchema => configSchema.properties.sending.properties.undoSend,
              keyPath: 'core.sending.undoSend',
              keywords: [],
            },
          ],
        },
        {
          groupName: 'READING & RESPONDING',
          groupItem: [
            {
              label: 'When reading messages, mark as read after',
              configSchema: configSchema =>
                configSchema.properties.reading.properties.markAsReadDelay,
              keyPath: 'core.reading.markAsReadDelay',
              keywords: [],
            },
            {
              label: 'Automatically load images in open emails',
              configSchema: configSchema =>
                configSchema.properties.reading.properties.autoloadImages,
              keyPath: 'core.reading.autoloadImages',
              keywords: [],
            },
            {
              label: 'Use the backspace/delete key to move emails to the trash',
              configSchema: configSchema =>
                configSchema.properties.reading.properties.backspaceDelete,
              keyPath: 'core.reading.backspaceDelete',
              keywords: [],
            },
            {
              label: 'Display conversations in descending chronological order',
              configSchema: configSchema =>
                configSchema.properties.reading.properties.descendingOrderMessageList,
              keyPath: 'core.reading.descendingOrderMessageList',
              keywords: [],
            },
            {
              label: 'Check messages for spelling',
              configSchema: configSchema => configSchema.properties.composing.properties.spellcheck,
              keyPath: 'core.composing.spellcheck',
              keywords: [],
            },
            {
              label: 'Default spellcheck language',
              configSchema: configSchema =>
                configSchema.properties.composing.properties.spellcheckDefaultLanguage,
              keyPath: 'core.composing.spellcheckDefaultLanguage',
              keywords: [],
            },
          ],
        },
        {
          groupName: 'MESSAGES/CHAT',
          groupItem: [
            {
              label: 'Enable chat feature',
              configSchema: configSchema => configSchema.properties.workspace.properties.enableChat,
              keyPath: 'core.workspace.enableChat',
              keywords: [],
            },
          ],
        },
        {
          groupName: 'DOWNLOADS',
          groupItem: [
            {
              label: 'Open containing folder after downloading attachments',
              configSchema: configSchema =>
                configSchema.properties.attachments.properties.openFolderAfterDownload,
              keyPath: 'core.attachments.openFolderAfterDownload',
              keywords: [],
            },
            {
              label: 'Display thumbnails for attachments when available (Mac only)',
              configSchema: configSchema =>
                configSchema.properties.attachments.properties.displayFilePreview,
              keyPath: 'core.attachments.displayFilePreview',
              keywords: [],
            },
            {
              label: 'Save downloaded files to',
              component: DownloadSelection,
              keyPath: 'core.attachments.downloadFolder',
              keywords: [],
            },
          ],
        },
      ],
    },
    {
      tabId: 'Notifications',
      displayName: 'Notifications',
      order: 2,
      configGroup: [
        {
          groupName: 'EMAIL NOTIFICATIONS',
          groupItem: [
            {
              label: 'Show notifications for new unread emails',
              configSchema: configSchema =>
                configSchema.properties.notifications.properties.enabled,
              keyPath: 'core.notifications.enabled',
              keywords: [],
            },
            {
              label: 'Dock badge count',
              configSchema: configSchema =>
                configSchema.properties.notifications.properties.countBadge,
              keyPath: 'core.notifications.countBadge',
              keywords: [],
            },
          ],
        },
      ],
    },
    {
      tabId: 'Accounts',
      displayName: 'Accounts',
      order: 3,
      configGroup: [
        {
          groupItem: [
            {
              label: 'Accounts',
              component: PreferencesAccounts,
              keywords: [],
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
      configGroup: [
        {
          groupName: 'LAYOUT',
          groupItem: [
            {
              label: 'Profile pictures',
              component: AppearanceProfileOptions,
              keywords: [],
            },
            {
              label: 'Panel',
              component: AppearancePanelOptions,
              keywords: [],
            },
          ],
        },
        {
          groupName: 'THEME',
          groupItem: [
            {
              label: 'Theme',
              component: AppearanceThemeSwitch,
              keywords: [],
            },
          ],
        },
        {
          groupName: 'SCALING',
          groupItem: [
            {
              label: 'AppearanceScaleSlider',
              component: AppearanceScaleSlider,
              keywords: [],
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
      configGroup: [
        {
          groupName: 'Quick Actions',
          groupItem: [
            {
              label: 'Show quick actions when hovering over emails in your list',
              configSchema: configSchema => configSchema.properties.quickActions.properties.enabled,
              keyPath: 'core.quickActions.enabled',
              keywords: [],
            },
            {
              label: 'Show preview image',
              keyPath: 'core.quickActions.image',
              component: CustomizeQuickActions,
              keywords: [],
            },
            {
              label: 'Action 1',
              configSchema: configSchema =>
                configSchema.properties.quickActions.properties.quickAction1,
              keyPath: 'core.quickActions.quickAction1',
              keywords: [],
            },
            {
              label: 'Action 2',
              configSchema: configSchema =>
                configSchema.properties.quickActions.properties.quickAction2,
              keyPath: 'core.quickActions.quickAction2',
              keywords: [],
            },
            {
              label: 'Action 3',
              configSchema: configSchema =>
                configSchema.properties.quickActions.properties.quickAction3,
              keyPath: 'core.quickActions.quickAction3',
              keywords: [],
            },
            {
              label: 'Action 4',
              configSchema: configSchema =>
                configSchema.properties.quickActions.properties.quickAction4,
              keyPath: 'core.quickActions.quickAction4',
              keywords: [],
            },
          ],
        },
        {
          groupName: 'Swipe Actions',
          groupItem: [
            {
              label: 'Enable swipe actions',
              configSchema: configSchema => configSchema.properties.swipeActions.properties.enabled,
              keyPath: 'core.swipeActions.enabled',
              keywords: [],
            },
            {
              label: 'Show preview image',
              keyPath: 'core.swipeActions.image',
              component: CustomizeSwipeActions,
              keywords: [],
            },
            {
              label: 'Left short swipe',
              configSchema: configSchema =>
                configSchema.properties.swipeActions.properties.leftShortAction,
              keyPath: 'core.swipeActions.leftShortAction',
              keywords: [],
            },
            {
              label: 'Left long swipe',
              configSchema: configSchema =>
                configSchema.properties.swipeActions.properties.leftLongAction,
              keyPath: 'core.swipeActions.leftLongAction',
              keywords: [],
            },
            {
              label: 'Right Short swipe',
              configSchema: configSchema =>
                configSchema.properties.swipeActions.properties.rightShortAction,
              keyPath: 'core.swipeActions.rightShortAction',
              keywords: [],
            },
            {
              label: 'Right Long swipe',
              configSchema: configSchema =>
                configSchema.properties.swipeActions.properties.rightLongAction,
              keyPath: 'core.swipeActions.rightLongAction',
              keywords: [],
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
      configGroup: [
        {
          groupName: 'SHORTCUTS',
          groupItem: [
            {
              label: 'SHORTCUTS',
              component: PreferencesKeymapsHearder,
              keywords: [],
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
      configGroup: [
        {
          groupItem: [
            {
              label: 'BlockedSenders',
              component: BlockedSenders,
              keywords: [],
            },
          ],
        },
      ],
    },
    {
      tabId: 'Privacy',
      displayName: 'Privacy',
      order: 130,
      configGroup: [
        {
          groupItem: [
            {
              label: 'Privacy',
              component: Privacy,
              keywords: [],
            },
          ],
        },
      ],
    },
  ],
};

export default preferencesTemplateFill;
