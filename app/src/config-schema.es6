import { RetinaImg } from 'mailspring-component-kit';
import React from 'react';
function actionOption(iconName, label) {
  return (
    <span>
      <RetinaImg
        name={`${iconName}.svg`}
        style={{ width: 24, height: 24 }}
        className={`color_${iconName}`}
        isIcon
        mode={RetinaImg.Mode.ContentIsMask}
      />
      {label}
    </span>
  );
}
const actionValues = ['', 'archive', 'trash', 'flag', 'read', 'folder'];
const actionLabels = [
  actionOption('none', 'None'),
  actionOption('archive', 'Archive'),
  actionOption('trash', 'Trash'),
  actionOption('flag', 'Flag'),
  actionOption('read', 'Mark Read/Unread'),
  actionOption('folder', 'Move to Folder'),
];
export default {
  core: {
    type: 'object',
    properties: {
      sync: {
        type: 'object',
        properties: {
          verboseUntil: {
            type: 'number',
            default: 0,
            title: 'Enable verbose IMAP / SMTP logging',
          },
        },
      },
      support: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            default: '',
            title: 'Support Id',
          },
        },
      },
      mailsync: {
        type: 'object',
        properties: {
          fetchEmailRange: {
            type: 'integer',
            default: 365,
            enum: [7, 30, 90, 365, -1],
            enumLabels: [
              'Within 7 Days',
              'Within 30 days',
              'Within 3 Month',
              'Within a Year',
              'All',
            ],
            title: 'Sync mail as far back as',
          },
          fetchEmailInterval: {
            type: 'integer',
            default: 1,
            enum: [1, 3, 5],
            enumLabels: ['every minute', 'every 3 minutes', 'every 5 minutes'],
            title: 'How far back would you like to sync your old mail',
          },
        },
      },
      workspace: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            default: 'list',
            enum: ['split', 'list'],
          },
          systemTray: {
            type: 'boolean',
            default: true,
            title: 'Show icon in menu bar',
            platforms: ['darwin', 'linux'],
          },
          showImportant: {
            type: 'boolean',
            default: true,
            title: 'Show important markers (Gmail only)',
          },
          showUnreadForAllCategories: {
            type: 'boolean',
            default: true,
            title: 'Show unread count for all folders',
          },
          chatEnable: {
            type: 'boolean',
            default: false,
            title: 'Enable chat feature',
          },
          chatProdEnv: {
            type: 'boolean',
            default: false,
            title: 'change chat environment to production',
          },
          use24HourClock: {
            type: 'boolean',
            default: false,
            title: 'Use 24-hour clock',
          },
          interfaceZoom: {
            title: 'Override standard interface scaling',
            type: 'number',
            default: 1,
            advanced: true,
          },
        },
      },
      disabledPackages: {
        type: 'array',
        default: [],
        items: {
          type: 'string',
        },
      },
      themes: {
        type: 'array',
        default: ['ui-light'],
        items: {
          type: 'string',
        },
      },
      keymapTemplate: {
        type: 'string',
        default: 'Gmail',
      },
      attachments: {
        type: 'object',
        properties: {
          openFolderAfterDownload: {
            type: 'boolean',
            default: false,
            title: 'Open containing folder after downloading attachments',
          },
          displayFilePreview: {
            type: 'boolean',
            default: true,
            title: 'Display thumbnails for attachments when available (Mac only)',
          },
          downloadFolder: {
            type: 'floder',
            title: 'Save downloaded files to',
          },
        },
      },
      reading: {
        type: 'object',
        properties: {
          markAsReadDelay: {
            type: 'integer',
            default: 500,
            enum: [0, 500, 2000, -1],
            enumLabels: ['Instantly', 'After ½ Second', 'After 2 Seconds', 'Manually'],
            title: 'When reading messages, mark as read after',
          },
          autoloadImages: {
            type: 'boolean',
            default: true,
            title: 'Automatically load images in open emails',
          },
          backspaceDelete: {
            type: 'boolean',
            default: false,
            title: 'Use the backspace/delete key to move emails to the trash',
          },
          descendingOrderMessageList: {
            type: 'boolean',
            default: false,
            title: 'Display conversations in descending chronological order',
          },
        },
      },
      composing: {
        type: 'object',
        properties: {
          spellcheck: {
            type: 'boolean',
            default: true,
            title: 'Check messages for spelling',
          },
          spellcheckDefaultLanguage: {
            type: 'string',
            default: '',
            enum: [
              '',
              'bg',
              'br',
              'ca',
              'cs',
              'da',
              'de',
              'de-at',
              'de-ch',
              'el',
              'en-au',
              'en-ca',
              'en-gb',
              'en-us',
              'en-za',
              'eo',
              'es',
              'et',
              'eu',
              'fo',
              'fr',
              'fur',
              'fy',
              'ga',
              'gd',
              'gl',
              'he',
              'hr',
              'hu',
              'is',
              'it',
              'ko',
              'la',
              'lb',
              'lt',
              'ltg',
              'lv',
              'mk',
              'mn',
              'nb',
              'ne',
              'nl',
              'nn',
              'pl',
              'pt',
              'pt-br',
              'ro',
              'ru',
              'rw',
              'sk',
              'sl',
              'sr',
              'sv',
              'tr',
              'uk',
              'vi',
            ],
            enumLabels: [
              '(System Default)',
              'Bulgarian',
              'Breton',
              'Catalan',
              'Czech',
              'Danish',
              'German',
              'German (Austria)',
              'German (Switzerland)',
              'Modern Greek',
              'English (Australia)',
              'English (Canada)',
              'English (United Kingdom)',
              'English (United States)',
              'English (South Africa)',
              'Esperanto',
              'Spanish',
              'Estonian',
              'Basque',
              'Faroese',
              'French',
              'Friulian',
              'Western Frisian',
              'Irish',
              'Gaelic',
              'Galician',
              'Hebrew',
              'Croatian',
              'Hungarian',
              'Icelandic',
              'Italian',
              'Korean',
              'Latin',
              'Luxembourgish',
              'Lithuanian',
              'Latgalian',
              'Latvian',
              'Macedonian',
              'Mongolian',
              'Norwegian Bokmål',
              'Nepali',
              'Dutch',
              'Norwegian Nynorsk',
              'Polish',
              'Portuguese',
              'Portuguese (Brazil)',
              'Romanian',
              'Russian',
              'Kinyarwanda',
              'Slovak',
              'Slovenian',
              'Serbian',
              'Swedish',
              'Turkish',
              'Ukrainian',
              'Vietnamese',
            ],
            title: 'Default spellcheck language',
            note:
              'If you write a draft in another language, Edison Mail will auto-detect it and use the correct spelling dictionary after a few sentences.',
          },
        },
      },
      quickActions: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            default: true,
            title: 'Show quick actions when hovering over emails in your list',
          },
          image: {
            type: 'component',
            title: 'Show preview image',
          },
          quickAction1: {
            type: 'string',
            default: 'archive',
            enum: actionValues,
            enumLabels: actionLabels,
            title: 'Action 1',
          },
          quickAction2: {
            type: 'string',
            default: 'flag',
            enum: actionValues,
            enumLabels: actionLabels,
            title: 'Action 2',
          },
          quickAction3: {
            type: 'string',
            default: 'trash',
            enum: actionValues,
            enumLabels: actionLabels,
            title: 'Action 3',
          },
          quickAction4: {
            type: 'string',
            default: 'read',
            enum: actionValues,
            enumLabels: actionLabels,
            title: 'Action 4',
          },
        },
      },
      swipeActions: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            default: true,
            title: 'Enable swipe actions',
          },
          image: {
            type: 'component',
            title: 'Show preview image',
          },
          leftShortAction: {
            type: 'string',
            default: 'archive',
            enum: actionValues,
            enumLabels: actionLabels,
            title: 'Left short swipe',
          },
          leftLongAction: {
            type: 'string',
            default: 'flag',
            enum: actionValues,
            enumLabels: actionLabels,
            title: 'Left long swipe',
          },
          rightShortAction: {
            type: 'string',
            default: 'read',
            enum: actionValues,
            enumLabels: actionLabels,
            title: 'Right Short swipe',
          },
          rightLongAction: {
            type: 'string',
            default: 'trash',
            enum: actionValues,
            enumLabels: actionLabels,
            title: 'Right Long swipe',
          },
        },
      },
      sending: {
        type: 'object',
        properties: {
          sounds: {
            type: 'boolean',
            default: true,
            title: 'Send mail sound',
          },
          defaultReplyType: {
            type: 'string',
            default: 'reply-all',
            enum: ['reply', 'reply-all'],
            enumLabels: ['Reply', 'Reply All'],
            title: 'Default reply behavior',
          },
          undoSend: {
            type: 'number',
            default: 5000,
            enum: [5000, 15000, 30000, 60000, 0],
            enumLabels: ['5 seconds', '15 seconds', '30 seconds', '60 seconds', 'Disable'],
            title: 'Undo time window',
          },
        },
      },
      notifications: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            default: true,
            title: 'Show notifications for new unread emails',
          },
          // enabledForRepeatedTrackingEvents: {
          //   type: 'boolean',
          //   default: true,
          //   title: 'Show notifications for repeated opens / clicks',
          // },
          sounds: {
            type: 'boolean',
            default: true,
            title: 'New mail sound',
          },
          // unsnoozeToTop: {
          //   type: 'boolean',
          //   default: true,
          //   title: 'Resurface messages to the top of the inbox when unsnoozing',
          // },
          countBadge: {
            type: 'string',
            default: 'unread',
            enum: ['hide', 'unread', 'total'],
            enumLabels: ['Hide Badge', 'Show Unread Count', 'Show Total Count'],
            title: 'Dock badge count',
          },
        },
      },
      appearance: {
        type: 'object',
        properties: {
          profile: {
            type: 'boolean',
            default: true,
            title: 'Show profile pictures',
          },
        },
      },
    },
  },
};
