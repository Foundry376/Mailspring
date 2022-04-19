import { localized } from './intl';

export default {
  core: {
    type: 'object',
    properties: {
      intl: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            title: 'Interface Langauge',
            default: '',
          },
        },
      },
      sync: {
        type: 'object',
        properties: {
          verboseUntil: {
            type: 'number',
            default: 0,
            title: localized('Enable verbose IMAP / SMTP logging'),
          },
        },
      },
      workspace: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            default: 'list',
            enum: ['split', 'list', 'splitVertical'],
          },
          systemTray: {
            type: 'boolean',
            default: true,
            title: localized('Show icon in menu bar / system tray'),
            note: localized(
              'On Linux you need to restart Mailspring for the tray icon to disappear.'
            ),
          },
          showImportant: {
            type: 'boolean',
            default: true,
            title: localized('Show Gmail-style important markers (Gmail Only)'),
          },
          showUnreadForAllCategories: {
            type: 'boolean',
            default: false,
            title: localized('Show unread counts for all folders / labels'),
          },
          use24HourClock: {
            type: 'boolean',
            default: false,
            title: localized('Use 24-hour clock'),
          },
          interfaceZoom: {
            title: localized('Override standard interface scaling'),
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
            title: localized('Open containing folder after downloading attachment'),
          },
          displayFilePreview: {
            type: 'boolean',
            default: true,
            title: localized('Display thumbnail previews for attachments when available.'),
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
            enumLabels: [
              localized('Instantly'),
              localized('After %@ Seconds', '0.5'),
              localized('After %@ Seconds', '2'),
              localized('Manually'),
            ],
            title: localized('When reading messages, mark as read'),
          },
          autoloadImages: {
            type: 'boolean',
            default: true,
            title: localized('Automatically load images in viewed messages'),
          },
          detailedHeaders: {
            type: 'boolean',
            default: false,
            title: localized('Show full message headers by default'),
          },
          detailedNames: {
            type: 'boolean',
            default: false,
            title: localized('Show first and last names of all recipients'),
          },
          restrictMaxWidth: {
            type: 'boolean',
            default: false,
            title: localized('Restrict width of messages to maximize readability'),
          },
          backspaceDelete: {
            type: 'boolean',
            default: false,
            title: localized('Move to trash (not archive) on swipe / backspace'),
          },
          descendingOrderMessageList: {
            type: 'boolean',
            default: false,
            title: localized('Display conversations in descending chronological order'),
          },
        },
      },
      composing: {
        type: 'object',
        properties: {
          html: {
            type: 'boolean',
            default: true,
            title: localized('Enable rich text and advanced editor features'),
            note: localized(
              'Many features are unavailable in plain-text mode. To create a single ' +
              'plain-text draft, hold Alt or Option while clicking Compose or Reply.'
            ),
          },
          spellcheck: {
            type: 'boolean',
            default: true,
            title: localized('Check messages for spelling'),
          },
          spellcheckDefaultLanguage: {
            type: 'string',
            default: '',
            enum: [
              '',
              'af',
              'bg',
              'ca',
              'cs',
              'da',
              'de',
              'el',
              'en-AU',
              'en-CA',
              'en-GB',
              'en-US',
              'es',
              'et',
              'fo',
              'fr',
              'he',
              'hi',
              'hr',
              'hu',
              'it',
              'ko',
              'lt',
              'lv',
              'nb',
              'nl',
              'pl',
              'pt',
              'pt-BR',
              'ro',
              'ru',
              'sk',
              'sl',
              'sq',
              'sr',
              'sv',
              'tr',
              'uk',
              'vi',
            ],
            enumLabels: [
              '(System Default)',
              'Afrikaans',
              'Bulgarian',
              'Catalan',
              'Czech',
              'Danish',
              'German',
              'Modern Greek',
              'English (Australia)',
              'English (Canada)',
              'English (United Kingdom)',
              'English (United States)',
              'Spanish',
              'Estonian',
              'Faroese',
              'French',
              'Hebrew',
              'Hindi',
              'Croatian',
              'Hungarian',
              'Italian',
              'Korean',
              'Lithuanian',
              'Latvian',
              'Norwegian Bokmål',
              'Dutch',
              'Polish',
              'Portuguese',
              'Portuguese (Brazil)',
              'Romanian',
              'Russian',
              'Slovak',
              'Slovenian',
              'Albanian',
              'Serbian',
              'Swedish',
              'Turkish',
              'Ukrainian',
              'Vietnamese',
            ],
            title: localized('Spellcheck language'),
            note: localized(
              'Windows and Linux only - on macOS, the spellcheck language is detected by the system as you type.'
            ),
          },
        },
      },
      sending: {
        type: 'object',
        properties: {
          sounds: {
            type: 'boolean',
            default: true,
            title: localized('Message Sent Sound'),
          },
          defaultSendType: {
            type: 'string',
            default: 'send',
            enum: ['send', 'send-and-archive'],
            enumLabels: [localized('Send'), localized('Send and Archive')],
            title: localized('Default send behavior'),
          },
          defaultReplyType: {
            type: 'string',
            default: 'reply-all',
            enum: ['reply', 'reply-all'],
            enumLabels: [localized('Reply'), localized('Reply All')],
            title: localized('Default reply behavior'),
          },
          undoSend: {
            type: 'number',
            default: 5000,
            enum: [5000, 15000, 30000, 60000, 0],
            enumLabels: [
              `5 ${localized('seconds')}`,
              `15 ${localized('seconds')}`,
              `30 ${localized('seconds')}`,
              `60 ${localized('seconds')}`,
              localized('Disable'),
            ],
            title: localized('After sending, enable undo for'),
          },
        },
      },
      contacts: {
        type: 'object',
        properties: {
          findInMailDisabled: {
            type: 'array',
            default: [],
            items: {
              type: 'string', // accountIds
            },
          },
        },
      },
      notifications: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            default: true,
            title: localized('Show notifications for new unread messages'),
          },
          enabledForRepeatedTrackingEvents: {
            type: 'boolean',
            default: true,
            title: localized('Show notifications for repeated opens / clicks'),
          },
          sounds: {
            type: 'boolean',
            default: true,
            title: localized('Play sound when receiving new mail'),
          },
          unsnoozeToTop: {
            type: 'boolean',
            default: true,
            title: localized('Resurface messages to the top of the inbox when unsnoozing'),
          },
          countBadge: {
            type: 'string',
            default: 'unread',
            enum: ['hide', 'unread', 'total'],
            enumLabels: [
              localized('Hide Badge'),
              localized('Show Unread Count'),
              localized('Show Total Count'),
            ],
            title: localized('Show badge on the app icon'),
          },
        },
      },
    },
  },
};
