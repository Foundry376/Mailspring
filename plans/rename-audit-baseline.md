# Rename Audit Report

- Generated: 2026-04-08T14:59:34Z
- Root: /home/frank/Development/Mailspring
- Scope: runtime-only (set INCLUDE_DOCS=1 to include docs and markdown)

## Cloud URLs And Hosts

- Count: 29 (total)
- Shown: 29 (first matches)
- Sample Matches:
```text
app/internal_packages/remove-tracking-pixels/lib/main.ts:175:      imageURL.includes(`getmailspring.com/open/${message.accountId.toUpperCase()}`) ||
app/internal_packages/remove-tracking-pixels/lib/main.ts:183:    if (imageURL.includes('getmailspring.com/o/')) {
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:50:    link: 'https://community.getmailspring.com/t/add-reminders-to-sent-messages/157',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:58:    link: 'https://community.getmailspring.com/t/view-contact-and-company-profiles/159',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:67:      'https://community.getmailspring.com/t/read-receipts-link-tracking-and-activity-reports/162',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:75:    link: 'https://community.getmailspring.com/t/reply-faster-with-email-templates/167',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:84:      'https://community.getmailspring.com/t/read-receipts-link-tracking-and-activity-reports/162',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:92:    link: 'https://community.getmailspring.com/t/schedule-messages-to-send-later/158',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:100:    link: 'https://community.getmailspring.com/t/view-contact-and-company-profiles/159',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:108:    link: 'https://community.getmailspring.com/t/snooze-emails-to-handle-them-later/161',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:117:      'https://community.getmailspring.com/t/read-receipts-link-tracking-and-activity-reports/162',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:125:    link: 'https://community.getmailspring.com/t/automatically-translate-incoming-email/166',
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:203:    const onLearnMore = () => shell.openExternal('https://getmailspring.com/pro');
app/internal_packages/preferences/lib/tabs/preferences-identity.tsx:266:            <a href="https://community.getmailspring.com/docs?topic=241">
app/internal_packages/preferences/lib/tabs/preferences-account-details.tsx:195:    shell.openExternal('https://support.getmailspring.com/hc/en-us/requests/new');
app/internal_packages/preferences/lib/tabs/workspace-section.tsx:65:                  'https://community.getmailspring.com/t/choose-mailspring-as-the-default-mail-client-on-linux/191'
app/internal_packages/open-tracking/package.json:7:    "staging": "https://link-staging.getmailspring.com",
app/internal_packages/open-tracking/package.json:8:    "production": "https://link.getmailspring.com"
app/internal_packages/thread-search/lib/search-bar-util.ts:21:  'https://community.getmailspring.com/t/search-with-advanced-gmail-style-queries/153';
app/internal_packages/thread-sharing/lib/thread-sharing-popover.tsx:146:            <a href="https://community.getmailspring.com/t/share-email-conversations-with-shareable-links/165">
app/internal_packages/thread-sharing/lib/main.tsx:47:  return `https://shared.getmailspring.com/thread/${identity.id}/${metadata.key}`;
app/internal_packages/thread-sharing/package.json:6:    "staging": "https://share-staging.getmailspring.com",
app/internal_packages/thread-sharing/package.json:7:    "production": "https://share.getmailspring.com"
app/internal_packages/link-tracking/package.json:7:    "staging": "https://link-staging.getmailspring.com",
app/internal_packages/link-tracking/package.json:8:    "production": "https://link.getmailspring.com"
app/internal_packages/activity/lib/dashboard/root.tsx:381:    shell.openExternal('http://support.getmailspring.com/hc/en-us/articles/115002507891');
app/internal_packages/composer-templates/lib/preferences-templates.tsx:89:            <a href="https://community.getmailspring.com/t/reply-faster-with-email-templates/167">
app/internal_packages/notifications/lib/items/account-error-notif.tsx:37:    let url = 'https://support.getmailspring.com/hc/en-us/requests/new';
app/internal_packages/composer-signature/lib/signature-photo-picker.tsx:170:      (resolvedURL.includes('getmailspring.com') || resolvedURL.includes('getpostra.com'));
```

## User-Facing Branding

- Count: 40 (total)
- Shown: 40 (first matches)
- Sample Matches:
```text
app/src/app-env.ts:119:    // Mailspring exports is designed to provide a lazy-loaded set of globally
app/src/app-env.ts:318:  // Public: Get the version of Mailspring.
app/src/app-env.ts:335:  // Public: Get the directory path to Mailspring's configuration area.
app/src/app-env.ts:359:  Section: Managing The Mailspring Window
app/src/flux/errors.ts:1:// This file contains custom Mailspring error classes.
app/internal_packages/ui-darkside/styles/theme-colors.less:1:/* The variables declared here are used by the theme picker in Mailspring
app/src/flux/models/message.ts:17:exception being drafts). Mailspring does not support operations such as move || delete on
app/src/flux/models/account.ts:14: * Public: The Account model represents a Account served by the Mailspring Platform API.
app/src/flux/models/account.ts:15: * Every object on the Mailspring platform exists within a Account, which typically represents
app/src/flux/models/model-with-metadata.ts:5: Cloud-persisted data that is associated with a single Mailspring API object
app/src/flux/models/provider-syncback-request.ts:28:    // always be optional and may change as the needs of a Mailspring contact
app/src/flux/attributes/attribute-boolean.ts:16:    // Some attributes we identify as booleans in Mailspring are ints
app/src/flux/attributes/attribute-collection.ts:7:For example, Threads in Mailspring have a collection of Labels or Folders.
app/internal_packages/ui-less-is-more/styles/theme-colors.less:1:/* The variables declared here are used by the theme picker in Mailspring
app/src/flux/actions.ts:20:Mailspring is a multi-window application. The `scope` of an Action dictates
app/src/flux/actions.ts:92:  Public: Fired when the Mailspring API Connector receives new data from the API.
app/src/flux/actions.ts:149:  Public: Manage the Mailspring identity
app/internal_packages/ui-ubuntu/styles/theme-colors.less:1:/* The variables declared here are used by the theme picker in Mailspring
app/internal_packages/ui-taiga/styles/theme-colors.less:1:/* The variables declared here are used by the theme picker in Mailspring
app/src/flux/stores/identity-store.ts:14:const LEGACY_PASSWORD_NAMES = ['Mailspring Account'];
app/src/flux/stores/identity-store.ts:198:   * Mailspring billing site. Please reference:
app/src/flux/stores/mail-rules-store.ts:59:    mail that has arrived since they last ran Mailspring. So, we keep a date. */
app/src/flux/stores/database-store.ts:84:Public: Mailspring is built on top of a custom database layer modeled after
app/src/flux/stores/folder-sync-progress-store.ts:143:   * Returns true if Mailspring's local cache contains the entire list of available
app/src/flux/stores/account-store.ts:177:   * When an account is removed from Mailspring, the AccountStore
app/src/flux/stores/draft-store.ts:36:It also creates and queues {Task} objects to persist changes to the Mailspring
app/src/components/composer-editor/emoji-toolbar-popover.tsx:271:    ctx.font = '24px Mailspring-Pro';
app/src/components/composer-editor/emoji-plugins.tsx:78:the last Mailspring editor.
app/src/registries/component-registry.ts:18:by Mailspring packages. Components can use {InjectedComponent} and {InjectedComponentSet}
app/src/registries/component-registry.ts:37:  // to extend the Mailspring user interface, and call the corresponding `unregister`
app/src/canvas-utils.ts:135:  const font = '26px Mailspring-Pro, sans-serif';
app/src/package-manager.ts:35:    // If the user starts without a Mailspring ID and then links one, immediately turn on the
app/src/browser/application-touch-bar.ts:7:Mailspring's touch bar implementation leverages the existing `menu templating`
app/src/components/key-commands-region.tsx:36:already been defined by core Mailspring defaults, as well as custom user
app/src/browser/window-manager.ts:213:    // Typically, Mailspring stays running in the background on all platforms,
app/src/browser/postra-window.ts:207:    // user asked for: Mailspring running silently in the background.
app/src/browser/postra-window.ts:282:      // This check against false prevents that Mailspring is closed when configuring the first mail account
app/src/chrome-user-agent-stylesheet-string.ts:4:assuming they're based off the default stylesheet instead of the Mailspring
app/src/intl.ts:27:// For now, we only default to a localized version of Mailspring if the translations
app/src/intl.ts:166:// The locale Mailspring will default to. We do not default to unverified translations
```

## Legacy Protocol Usage

- Count: 61 (total)
- Shown: 61 (first matches)
- Sample Matches:
```text
app/internal_packages/open-tracking/lib/open-tracking-button.tsx:59:        iconUrl="mailspring://open-tracking/assets/icon-composer-eye@2x.png"
app/internal_packages/open-tracking/lib/open-tracking-message-status.tsx:66:            url="mailspring://open-tracking/assets/InMessage-opened@2x.png"
app/src/extensions/composer-extension.ts:73:  // - `iconUrl`: The url of your icon. It should be in the `mailspring://`
app/src/extensions/composer-extension.ts:74:  // scheme.  For example: `mailspring://your-package-name/assets/my-icon@2x.png`.
app/static/style/email-frame.less:9:    src: url('mailspring://custom-fonts/fonts/Custom-Thin.otf');
app/static/style/email-frame.less:16:    src: url('mailspring://custom-fonts/fonts/Custom-Blond.otf');
app/static/style/email-frame.less:23:    src: url('mailspring://custom-fonts/fonts/Custom-Normal.otf');
app/static/style/email-frame.less:30:    src: url('mailspring://custom-fonts/fonts/Custom-Medium.otf');
app/static/style/email-frame.less:37:    src: url('mailspring://custom-fonts/fonts/Custom-SemiBold.otf');
app/static/style/email-frame.less:46:    src: url('mailspring://custom-fonts/fonts/Custom-Normal.otf'), Helvetica, sans-serif;
app/internal_packages/open-tracking/lib/open-tracking-icon.tsx:89:          url="mailspring://open-tracking/assets/icon-tracking-opened@2x.png"
app/src/registries/sound-registry.ts:23:      if (src.indexOf('mailspring://') === 0) {
app/internal_packages/composer-grammar-check/lib/grammar-check-toggle.tsx:116:            url="mailspring://composer-grammar-check/assets/icon-composer-grammar@2x.png"
app/internal_packages/composer-grammar-check/lib/grammar-check-store.ts:12:  iconUrl: 'mailspring://composer-grammar-check/assets/ic-modal-image@2x.png',
app/src/browser/mailspring-protocol-handler.ts:8:// custom resource loader for 'postra://' and 'mailspring://' URLs.
app/src/browser/main.js:189:  // the items and pluck out things that look like mailto:, postra:, mailspring:, file paths
app/src/browser/main.js:205:    if (arg.startsWith('mailto:') || arg.startsWith('postra:') || arg.startsWith('mailspring:')) {
app/src/browser/main.js:440:            "default-src * postra: mailspring:; script-src 'self' 'unsafe-inline' chrome-extension://react-developer-tools; style-src * 'unsafe-inline' postra: mailspring:; img-src * data: postra: mailspring: file:; object-src none; media-src postra: mailspring:; manifest-src none;",
app/internal_packages/notifications/styles/styles.less:56:  background: url(mailspring://notifications/assets/minichevron@2x.png) top left no-repeat;
app/src/browser/application.ts:878:    } else if (parts.protocol === 'postra:' || parts.protocol === 'mailspring:') {
app/src/browser/notification-ipc.ts:163:  // the OS protocol handler (mailspring:// URLs) rather than Electron's Activated callback,
app/internal_packages/custom-sounds/lib/main.ts:4:  SoundRegistry.register('send', 'mailspring://custom-sounds/CUSTOM_UI_Send_v1.ogg');
app/internal_packages/custom-sounds/lib/main.ts:5:  SoundRegistry.register('confirm', 'mailspring://custom-sounds/CUSTOM_UI_Confirm_v1.ogg');
app/internal_packages/custom-sounds/lib/main.ts:6:  SoundRegistry.register('hit-send', 'mailspring://custom-sounds/CUSTOM_UI_HitSend_v1.ogg');
app/internal_packages/custom-sounds/lib/main.ts:7:  SoundRegistry.register('new-mail', 'mailspring://custom-sounds/CUSTOM_UI_NewMail_v1.ogg');
app/internal_packages/personal-level-indicators/lib/personal-level-icon.tsx:20:          url={`mailspring://personal-level-indicators/assets/PLI-Level${level}@2x.png`}
app/internal_packages/translation/lib/service.ts:127:  iconUrl: 'mailspring://translation/assets/ic-translation-modal@2x.png',
app/internal_packages/custom-fonts/styles/fonts.less:6:  src: url('mailspring://custom-fonts/fonts/Custom-Thin.otf');
app/internal_packages/custom-fonts/styles/fonts.less:13:  src: url('mailspring://custom-fonts/fonts/Custom-Blond.otf');
app/internal_packages/custom-fonts/styles/fonts.less:20:  src: url('mailspring://custom-fonts/fonts/Custom-Normal.otf');
app/internal_packages/custom-fonts/styles/fonts.less:27:  src: url('mailspring://custom-fonts/fonts/Custom-Medium.otf');
app/internal_packages/custom-fonts/styles/fonts.less:34:  src: url('mailspring://custom-fonts/fonts/Custom-SemiBold.otf');
app/internal_packages/custom-fonts/styles/fonts.less:43:  src: url('mailspring://custom-fonts/fonts/Custom-Normal.otf'), Helvetica, sans-serif;
app/internal_packages/thread-sharing/lib/thread-sharing-popover.tsx:73:            iconUrl: 'mailspring://thread-sharing/assets/ic-modal-image@2x.png',
app/internal_packages/translation/lib/message-header.tsx:247:          iconUrl: 'mailspring://translation/assets/ic-translation-modal@2x.png',
app/internal_packages/link-tracking/lib/link-tracking-message-extension.tsx:42:        dotNode.src = 'mailspring://link-tracking/assets/ic-tracking-visited@2x.png';
app/internal_packages/link-tracking/lib/link-tracking-message-extension.tsx:66:        dotNode.src = 'mailspring://link-tracking/assets/ic-tracking-unvisited@2x.png';
app/internal_packages/translation/lib/composer-button.tsx:106:          url="mailspring://translation/assets/icon-composer-translate@2x.png"
app/internal_packages/composer-templates/lib/template-picker.tsx:134:          url="mailspring://composer-templates/assets/icon-composer-templates@2x.png"
app/internal_packages/print/lib/print-window.ts:35:          <meta http-equiv="Content-Security-Policy" content="default-src * postra: mailspring:; frame-src 'none'; script-src 'self' chrome-extension://react-developer-tools; style-src * 'unsafe-inline' postra: mailspring:; img-src * data: postra: mailspring: file:; object-src none; media-src none; manifest-src none;">
app/internal_packages/message-view-on-github/lib/view-on-github-button.tsx:165:            url="mailspring://message-view-on-github/assets/github@2x.png"
app/src/window-event-handler.ts:362:    if (['mailto:', 'postra:', 'mailspring:'].includes(protocol)) {
app/internal_packages/thread-snooze/lib/time-card-popover.tsx:65:    const iconPath = `mailspring://thread-snooze/assets/ic-snoozepopover-${iconName}@2x.png`;
app/static/db-migration.html:5:  <meta http-equiv="Content-Security-Policy" content="default-src * postra: mailspring:; script-src 'self' chrome-extension://react-developer-tools; style-src * 'unsafe-inline' postra: mailspring:; img-src * data: postra: mailspring: file:; object-src none; media-src none; manifest-src none;">
app/static/db-vacuum.html:5:  <meta http-equiv="Content-Security-Policy" content="default-src * postra: mailspring:; script-src 'self' chrome-extension://react-developer-tools; style-src * 'unsafe-inline' postra: mailspring:; img-src * data: postra: mailspring: file:; object-src none; media-src none; manifest-src none;">
app/static/index.html:6:  <meta http-equiv="Content-Security-Policy" content="default-src * postra: mailspring:; script-src 'self' chrome-extension://react-developer-tools; style-src * 'unsafe-inline' postra: mailspring:; img-src * data: postra: mailspring: file:; object-src none; media-src postra: mailspring:; manifest-src none;">
app/internal_packages/send-and-archive/lib/send-and-archive-extension.ts:9:      iconUrl: 'mailspring://send-and-archive/images/composer-archive@2x.png',
app/internal_packages/participant-profile/lib/social-web-search.tsx:87:          url="mailspring://participant-profile/assets/linkedin-sidebar-icon@2x.png"
app/internal_packages/participant-profile/lib/social-web-search.tsx:98:          url="mailspring://participant-profile/assets/facebook-sidebar-icon@2x.png"
app/internal_packages/participant-profile/lib/social-web-search.tsx:115:          url="mailspring://participant-profile/assets/twitter-sidebar-icon@2x.png"
app/internal_packages/participant-profile/lib/sidebar-participant-profile.tsx:75:          url={`mailspring://participant-profile/assets/${service}-sidebar-icon@2x.png`}
app/internal_packages/participant-profile/lib/sidebar-participant-profile.tsx:136:          url={`mailspring://participant-profile/assets/${icon}-icon@2x.png`}
app/internal_packages/github-contact-card/lib/github-contact-card-section.tsx:39:        src="mailspring://github-contact-card/assets/github.png"
app/src/components/retina-img.tsx:75:      May be an http, https, or `mailspring://<packagename>/<path within package>` URL.
app/src/components/outline-view.tsx:186:          url="mailspring://account-sidebar/assets/icon-sidebar-addcategory@2x.png"
app/internal_packages/message-list/lib/message-item-body.tsx:22:  '<img alt="spinner.gif" src="mailspring://message-list/assets/spinner.gif" style="-webkit-user-drag: none;">';
app/src/components/metadata-composer-toggle-button.tsx:126:          iconUrl: `mailspring://${pluginId}/assets/ic-modal-image@2x.png`,
app/internal_packages/onboarding/lib/page-tutorial.tsx:142:              src={`mailspring://onboarding/assets/${current.image}`}
app/internal_packages/onboarding/lib/page-welcome.tsx:22:              url="mailspring://onboarding/assets/icons-bg@2x.png"
app/internal_packages/onboarding/styles/onboarding.less:405:        background: url(mailspring://onboarding/assets/app-screenshot@2x.png) top left no-repeat;
app/internal_packages/onboarding/styles/onboarding.less:422:            background: url(mailspring://onboarding/assets/app-screenshot@2x.png) top left no-repeat;
```

## Legacy Identifiers And Module Names

- Count: 747 (total)
- Shown: 200 (first matches)
- Sample Matches:
```text
app/src/sheet-toolbar.tsx:7:import { localized, isRTL, Actions, ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
app/src/mailbox-perspective.ts:22:import { QuerySubscription } from 'mailspring-exports';
app/internal_packages/send-later/lib/main.ts:10:} from 'mailspring-exports';
app/internal_packages/send-later/lib/main.ts:11:import { HasTutorialTip } from 'mailspring-component-kit';
app/internal_packages/send-later/lib/send-later-status.tsx:12:} from 'mailspring-exports';
app/internal_packages/send-later/lib/send-later-status.tsx:13:import { RetinaImg } from 'mailspring-component-kit';
app/src/mailsync-process.ts:13:import { IIdentity, Account } from 'mailspring-exports';
app/src/mailsync-process.ts:162:      const rootURLForServer = require('./flux/mailspring-api-request').rootURLForServer;
app/src/mailsync-process.ts:375:      Utils = require('mailspring-exports').Utils;
app/internal_packages/send-later/lib/send-later-button.tsx:10:} from 'mailspring-exports';
app/internal_packages/send-later/lib/send-later-button.tsx:11:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/send-later/lib/send-later-popover.tsx:3:import { localized, Actions } from 'mailspring-exports';
app/src/extensions/composer-extension.ts:1:import { Message, Contact } from 'mailspring-exports';
app/src/services/autolinker.ts:1:import { RegExpUtils, DOMUtils } from 'mailspring-exports';
app/internal_packages/draft-list/lib/draft-list-toolbar.tsx:6:} from 'mailspring-component-kit';
app/internal_packages/draft-list/lib/draft-list-toolbar.tsx:10:import { Message } from 'mailspring-exports';
app/internal_packages/participant-profile/lib/main.ts:1:import { ComponentRegistry } from 'mailspring-exports';
app/internal_packages/draft-list/lib/main.ts:1:import { WorkspaceStore, ComponentRegistry, Actions } from 'mailspring-exports';
app/internal_packages/draft-list/lib/draft-toolbar-buttons.tsx:2:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/draft-list/lib/draft-toolbar-buttons.tsx:3:import { localized, PropTypes, Actions } from 'mailspring-exports';
app/internal_packages/custom-sounds/lib/main.ts:1:import { SoundRegistry } from 'mailspring-exports';
app/internal_packages/participant-profile/lib/participant-profile-data-source.ts:1:import { MailspringAPIRequest, Utils, IdentityStoreConfig } from 'mailspring-exports';
app/internal_packages/participant-profile/lib/participant-profile-data-source.ts:4:const { makeRequest } = MailspringAPIRequest;
app/internal_packages/participant-profile/lib/social-web-search.tsx:2:import { localized, Contact, PropTypes } from 'mailspring-exports';
app/internal_packages/participant-profile/lib/social-web-search.tsx:3:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/participant-profile/lib/sidebar-participant-profile.tsx:2:import { localized, Contact, PropTypes, DOMUtils, RegExpUtils, Utils } from 'mailspring-exports';
app/internal_packages/participant-profile/lib/sidebar-participant-profile.tsx:3:import { RetinaImg, ContactProfilePhoto } from 'mailspring-component-kit';
app/internal_packages/draft-list/lib/draft-list-store.ts:1:import MailspringStore from 'mailspring-store';
app/internal_packages/draft-list/lib/draft-list-store.ts:13:} from 'mailspring-exports';
app/internal_packages/draft-list/lib/draft-list-store.ts:14:import { ListTabular, ListDataSource } from 'mailspring-component-kit';
app/internal_packages/draft-list/lib/draft-list-store.ts:16:class DraftListStore extends MailspringStore {
app/internal_packages/participant-profile/lib/local-participant-profile.ts:2:import { Contact, Utils } from 'mailspring-exports';
app/internal_packages/participant-profile/lib/sidebar-related-threads.tsx:11:} from 'mailspring-exports';
app/internal_packages/composer-grammar-check/lib/grammar-check-toggle.tsx:9:} from 'mailspring-exports';
app/internal_packages/composer-grammar-check/lib/grammar-check-toggle.tsx:10:import { RetinaImg } from 'mailspring-component-kit';
app/static/style/workspace.less:16:mailspring-workspace {
app/static/style/workspace.less:524:  mailspring-workspace {
app/internal_packages/draft-list/lib/draft-list-columns.tsx:2:import { localized, Utils } from 'mailspring-exports';
app/internal_packages/draft-list/lib/draft-list-columns.tsx:3:import { InjectedComponentSet, ListTabular } from 'mailspring-component-kit';
app/internal_packages/draft-list/lib/draft-list.tsx:2:import { Actions } from 'mailspring-exports';
app/internal_packages/draft-list/lib/draft-list.tsx:8:} from 'mailspring-component-kit';
app/internal_packages/composer-grammar-check/lib/grammar-check-store.ts:1:import MailspringStore from 'mailspring-store';
app/internal_packages/composer-grammar-check/lib/grammar-check-store.ts:2:import { localized, FeatureUsageStore, IdentityStore } from 'mailspring-exports';
app/internal_packages/composer-grammar-check/lib/grammar-check-store.ts:20:class _GrammarCheckStore extends MailspringStore {
app/internal_packages/draft-list/lib/sending-progress-bar.tsx:2:import { PropTypes, Utils } from 'mailspring-exports';
app/internal_packages/activity/lib/plugin-helpers.ts:1:import { localized } from 'mailspring-exports';
app/internal_packages/composer-grammar-check/lib/main.ts:6:} from 'mailspring-exports';
app/internal_packages/composer-grammar-check/lib/main.ts:7:import { HasTutorialTip } from 'mailspring-component-kit';
app/src/services/search/search-query-backend-local.ts:13:import { DateUtils } from 'mailspring-exports';
app/internal_packages/category-mapper/lib/main.ts:1:import { localized, PreferencesUIStore } from 'mailspring-exports';
app/internal_packages/draft-list/lib/draft-list-send-status.tsx:3:import { DateUtils, Message } from 'mailspring-exports';
app/internal_packages/draft-list/lib/draft-list-send-status.tsx:4:import { Flexbox } from 'mailspring-component-kit';
app/internal_packages/attachments/lib/main.ts:1:import { ComponentRegistry } from 'mailspring-exports';
app/internal_packages/activity/lib/activity-data-source.ts:1:import { Rx, Message, DatabaseStore } from 'mailspring-exports';
app/internal_packages/category-mapper/lib/preferences-category-mapper.tsx:10:} from 'mailspring-exports';
app/src/services/quoted-html-transformer.ts:22:  annotationClass = 'mailspring-quoted-text-segment';
app/internal_packages/thread-snooze/lib/snooze-account-sidebar-extension.ts:1:import { localized, MailboxPerspective } from 'mailspring-exports';
app/internal_packages/attachments/lib/message-attachments.tsx:3:import { Actions, Utils, AttachmentStore, File } from 'mailspring-exports';
app/internal_packages/attachments/lib/message-attachments.tsx:4:import { AttachmentItem, ImageAttachmentItem } from 'mailspring-component-kit';
app/internal_packages/category-mapper/lib/category-selection.tsx:8:} from 'mailspring-component-kit';
app/internal_packages/category-mapper/lib/category-selection.tsx:9:import { localized, Label, Utils, PropTypes } from 'mailspring-exports';
app/internal_packages/activity/lib/main.ts:7:} from 'mailspring-exports';
app/internal_packages/activity/lib/main.ts:8:import { HasTutorialTip } from 'mailspring-component-kit';
app/src/mail-rules-templates.ts:1:import { Categories } from 'mailspring-observables';
app/internal_packages/thread-snooze/lib/snooze-utils.ts:13:} from 'mailspring-exports';
app/internal_packages/onboarding/lib/page-top-bar.tsx:3:import { AccountStore } from 'mailspring-exports';
app/internal_packages/onboarding/lib/page-top-bar.tsx:4:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/composer-grammar-check/lib/grammar-check-service.ts:1:import { MailspringAPIRequest } from 'mailspring-exports';
app/internal_packages/composer-grammar-check/lib/grammar-check-service.ts:121:      data = await MailspringAPIRequest.makeRequest({
app/internal_packages/thread-snooze/lib/snooze-store.ts:1:import MailspringStore from 'mailspring-store';
app/internal_packages/thread-snooze/lib/snooze-store.ts:9:} from 'mailspring-exports';
app/internal_packages/thread-snooze/lib/snooze-store.ts:15:class _SnoozeStore extends MailspringStore {
app/internal_packages/thread-snooze/lib/main.ts:1:import { localized, ComponentRegistry, ExtensionRegistry } from 'mailspring-exports';
app/internal_packages/thread-snooze/lib/main.ts:2:import { HasTutorialTip } from 'mailspring-component-kit';
app/internal_packages/activity/lib/list/activity-list-button.tsx:2:import { Actions, ReactDOM, localized } from 'mailspring-exports';
app/internal_packages/activity/lib/list/activity-list-button.tsx:3:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/thread-snooze/lib/snooze-buttons.tsx:4:import { Actions, FocusedPerspectiveStore, Thread } from 'mailspring-exports';
app/internal_packages/thread-snooze/lib/snooze-buttons.tsx:5:import { RetinaImg, BindGlobalCommands, RovingTabIndexToolbar } from 'mailspring-component-kit';
app/internal_packages/onboarding/lib/page-account-settings-o365.tsx:3:import { Account } from 'mailspring-exports';
app/src/searchable-components/virtual-dom-parser.ts:3:import { VirtualDOMUtils } from 'mailspring-exports';
app/internal_packages/activity/lib/list/activity-list.tsx:3:import { localized, Actions, FocusedPerspectiveStore } from 'mailspring-exports';
app/internal_packages/activity/lib/list/activity-list.tsx:4:import { Flexbox, ScrollRegion, RetinaImg } from 'mailspring-component-kit';
app/internal_packages/thread-snooze/lib/snooze-popover.tsx:3:import { localized, DateUtils, Actions, Thread } from 'mailspring-exports';
app/internal_packages/thread-snooze/lib/time-card-popover.tsx:2:import { localized, DateUtils } from 'mailspring-exports';
app/internal_packages/thread-snooze/lib/time-card-popover.tsx:3:import { DateInput, RetinaImg } from 'mailspring-component-kit';
app/internal_packages/activity/lib/list/activity-list-empty-state.tsx:2:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/activity/lib/list/activity-list-empty-state.tsx:3:import { localizedReactFragment } from 'mailspring-exports';
app/src/searchable-components/unified-dom-parser.ts:1:import { Utils } from 'mailspring-exports';
app/internal_packages/translation/lib/main.tsx:9:import { ComponentRegistry, ExtensionRegistry } from 'mailspring-exports';
app/internal_packages/events/lib/event-header.tsx:1:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/events/lib/event-header.tsx:18:} from 'mailspring-exports';
app/src/searchable-components/real-dom-parser.ts:2:import { DOMUtils } from 'mailspring-exports';
app/internal_packages/composer-templates/lib/main.ts:7:} from 'mailspring-exports';
app/internal_packages/activity/lib/list/activity-list-item-container.tsx:3:import { DisclosureTriangle, Flexbox, RetinaImg } from 'mailspring-component-kit';
app/internal_packages/activity/lib/list/activity-list-item-container.tsx:4:import { localized, DateUtils } from 'mailspring-exports';
app/internal_packages/thread-snooze/lib/snooze-mail-label.tsx:3:import { localized, FocusedPerspectiveStore, Thread } from 'mailspring-exports';
app/internal_packages/thread-snooze/lib/snooze-mail-label.tsx:4:import { RetinaImg, MailLabel } from 'mailspring-component-kit';
app/src/app-env.ts:116:    // require of mailspring-observables
app/src/app-env.ts:117:    require('mailspring-observables');
app/src/app-env.ts:120:    // accessible objects to all packages. Upon require, mailspring-exports will
app/src/app-env.ts:126:    require('mailspring-exports');
app/src/app-env.ts:782:    const item = document.createElement('mailspring-workspace');
app/src/app-env.ts:873:      const { Actions } = require('mailspring-exports');
app/src/app-env.ts:874:      const { CodeSnippet } = require('mailspring-component-kit');
app/src/app-env.ts:932:  // https://phab.mailspring.com/D1932#inline-11722
app/internal_packages/screenshot-mode/lib/screenshot-mode-message-extension.ts:1:import { MessageViewExtension } from 'mailspring-exports';
app/internal_packages/composer-templates/lib/template-composer-extension.ts:1:import { localized, ComposerExtension } from 'mailspring-exports';
app/internal_packages/events/lib/main.tsx:8:} from 'mailspring-exports';
app/internal_packages/translation/lib/service.ts:6:  MailspringAPIRequest,
app/internal_packages/translation/lib/service.ts:9:} from 'mailspring-exports';
app/internal_packages/translation/lib/service.ts:239:      response = await MailspringAPIRequest.makeRequest({
app/internal_packages/onboarding/lib/page-account-settings-outlook.tsx:3:import { Account } from 'mailspring-exports';
app/internal_packages/screenshot-mode/lib/main.ts:3:import { ExtensionRegistry, MessageStore } from 'mailspring-exports';
app/internal_packages/activity/lib/activity-mailbox-perspective.ts:1:import { WorkspaceStore, MailboxPerspective } from 'mailspring-exports';
app/internal_packages/composer-templates/lib/preferences-templates.tsx:4:import { Flexbox, EditableList, ComposerEditor, ComposerSupport } from 'mailspring-component-kit';
app/internal_packages/composer-templates/lib/preferences-templates.tsx:5:import { Actions, localized, localizedReactFragment } from 'mailspring-exports';
app/internal_packages/onboarding/lib/page-authenticate.tsx:3:import { PropTypes, MailspringAPIRequest, IdentityAuthResponse } from 'mailspring-exports';
app/internal_packages/onboarding/lib/page-authenticate.tsx:4:import { Webview } from 'mailspring-component-kit';
app/internal_packages/onboarding/lib/page-authenticate.tsx:15:    return `${MailspringAPIRequest.rootURLForServer('identity')}/onboarding?${qs.stringify({
app/internal_packages/translation/lib/message-header.tsx:12:} from 'mailspring-exports';
app/internal_packages/translation/lib/message-header.tsx:15:import { Menu, ButtonDropdown, RetinaImg } from 'mailspring-component-kit';
app/internal_packages/onboarding/lib/main.ts:1:import { SystemStartService, WorkspaceStore, ComponentRegistry } from 'mailspring-exports';
app/internal_packages/activity/lib/activity-event-store.tsx:1:import MailspringStore from 'mailspring-store';
app/internal_packages/activity/lib/activity-event-store.tsx:10:} from 'mailspring-exports';
app/internal_packages/activity/lib/activity-event-store.tsx:25:class ActivityEventStore extends MailspringStore {
app/internal_packages/thread-list/lib/thread-list-participants.tsx:2:import { PropTypes, Utils } from 'mailspring-exports';
app/internal_packages/thread-list/lib/thread-list-participants.tsx:3:import { AccountColorBar } from 'mailspring-component-kit';
app/internal_packages/composer-templates/lib/template-store.ts:9:} from 'mailspring-exports';
app/internal_packages/composer-templates/lib/template-store.ts:11:import MailspringStore from 'mailspring-store';
app/internal_packages/composer-templates/lib/template-store.ts:19:class TemplateStore extends MailspringStore {
app/internal_packages/translation/lib/composer-button.tsx:10:} from 'mailspring-exports';
app/internal_packages/translation/lib/composer-button.tsx:12:import { Menu, RetinaImg } from 'mailspring-component-kit';
app/internal_packages/translation/lib/composer-button.tsx:87:  // These components are part of N1's standard `mailspring-component-kit` library,
app/internal_packages/composer-templates/lib/template-status-bar.tsx:2:import { localized, PropTypes, Message, MessageWithEditorState } from 'mailspring-exports';
app/internal_packages/thread-list/lib/thread-list-icon.tsx:2:import { localized, PropTypes, Actions, TaskFactory, ExtensionRegistry } from 'mailspring-exports';
app/internal_packages/onboarding/lib/page-initial-preferences.tsx:5:import { RetinaImg, Flexbox, ConfigPropContainer } from 'mailspring-component-kit';
app/internal_packages/onboarding/lib/page-initial-preferences.tsx:6:import { localized, AccountStore, Account } from 'mailspring-exports';
app/internal_packages/composer-templates/lib/template-picker.tsx:3:import { localized, PropTypes, Actions, Message } from 'mailspring-exports';
app/internal_packages/composer-templates/lib/template-picker.tsx:4:import { Menu, RetinaImg } from 'mailspring-component-kit';
app/internal_packages/thread-list/lib/injects-toolbar-buttons.tsx:3:import { ListensToObservable, InjectedComponentSet } from 'mailspring-component-kit';
app/src/flux/mailsync-bridge.ts:21:import { Model } from 'mailspring-exports';
app/internal_packages/onboarding/lib/account-providers.tsx:1:import { localized, localizedReactFragment, React } from 'mailspring-exports';
app/internal_packages/thread-list/lib/thread-list-aria-utils.ts:1:import { Thread, FocusedPerspectiveStore, DateUtils, localized } from 'mailspring-exports';
app/internal_packages/onboarding/lib/form-error-message.tsx:6:import { PropTypes, RegExpUtils } from 'mailspring-exports';
app/internal_packages/onboarding/lib/page-account-settings-imap.tsx:3:import { localized, Account } from 'mailspring-exports';
app/internal_packages/thread-list/lib/main.ts:1:import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
app/internal_packages/activity/lib/dashboard/timespan-selector.tsx:4:import { localized } from 'mailspring-exports';
app/internal_packages/activity/lib/dashboard/timespan-selector.tsx:5:import { DropdownMenu, Menu } from 'mailspring-component-kit';
app/internal_packages/onboarding/lib/onboarding-store.ts:7:} from 'mailspring-exports';
app/internal_packages/onboarding/lib/onboarding-store.ts:9:import MailspringStore from 'mailspring-store';
app/internal_packages/onboarding/lib/onboarding-store.ts:13:class OnboardingStore extends MailspringStore {
app/internal_packages/thread-list/lib/thread-list-store.ts:1:import MailspringStore from 'mailspring-store';
app/internal_packages/thread-list/lib/thread-list-store.ts:11:} from 'mailspring-exports';
app/internal_packages/thread-list/lib/thread-list-store.ts:12:import { ListTabular, ListDataSource } from 'mailspring-component-kit';
app/internal_packages/thread-list/lib/thread-list-store.ts:15:class ThreadListStore extends MailspringStore {
app/internal_packages/main-calendar/lib/calendar-menu-commands.tsx:3:import { BindGlobalCommands } from 'mailspring-component-kit';
app/internal_packages/thread-list/lib/thread-list-context-menu.ts:11:} from 'mailspring-exports';
app/internal_packages/main-calendar/lib/quick-event-popover.tsx:2:import { Actions, Calendar, DatabaseStore, DateUtils, localized } from 'mailspring-exports';
app/internal_packages/main-calendar/lib/quick-event-popover.tsx:56:    const disabledCalendars: string[] = AppEnv.config.get('mailspring.disabledCalendars') || [];
app/internal_packages/activity/lib/dashboard/root.tsx:5:import { ScrollRegion, ListensToFluxStore, RetinaImg } from 'mailspring-component-kit';
app/internal_packages/activity/lib/dashboard/root.tsx:14:} from 'mailspring-exports';
app/internal_packages/onboarding/lib/newsletter-signup.tsx:4:import { RetinaImg, Flexbox } from 'mailspring-component-kit';
app/internal_packages/onboarding/lib/newsletter-signup.tsx:5:import { IdentityStore, localized, MailspringAPIRequest } from 'mailspring-exports';
app/internal_packages/onboarding/lib/newsletter-signup.tsx:63:      const { status } = await MailspringAPIRequest.makeRequest({
app/internal_packages/onboarding/lib/newsletter-signup.tsx:81:      const { status } = await MailspringAPIRequest.makeRequest({
app/internal_packages/onboarding/lib/newsletter-signup.tsx:95:      const { status } = await MailspringAPIRequest.makeRequest({
app/internal_packages/thread-list/lib/types.ts:1:import { Message, Thread } from 'mailspring-exports';
app/internal_packages/main-calendar/lib/main.tsx:2:import { WorkspaceStore, ComponentRegistry, localized } from 'mailspring-exports';
app/internal_packages/main-calendar/lib/main.tsx:4:import { PostraCalendar } from './core/mailspring-calendar';
app/internal_packages/onboarding/lib/page-account-settings.tsx:2:import { localized, Account, PropTypes, RegExpUtils } from 'mailspring-exports';
app/internal_packages/activity/lib/dashboard/main.ts:8:} from 'mailspring-exports';
app/internal_packages/thread-list/lib/selected-items-stack.tsx:4:import { ListensToObservable } from 'mailspring-component-kit';
app/internal_packages/thread-list/lib/selected-items-stack.tsx:5:import { localized } from 'mailspring-exports';
app/internal_packages/composer-signature/lib/signature-template-picker.tsx:2:import { localized, PropTypes } from 'mailspring-exports';
app/internal_packages/send-and-archive/lib/main.ts:1:import { ExtensionRegistry } from 'mailspring-exports';
app/internal_packages/thread-list/lib/thread-list-vertical.tsx:2:import { InjectedComponentSet } from 'mailspring-component-kit';
app/internal_packages/thread-list/lib/thread-list-vertical.tsx:3:import { WorkspaceStore } from 'mailspring-exports';
app/internal_packages/composer-signature/lib/signature-utils.ts:1:import { RegExpUtils } from 'mailspring-exports';
app/internal_packages/activity/lib/dashboard/metrics-components.tsx:2:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/activity/lib/dashboard/metrics-components.tsx:3:import { localized, isRTL } from 'mailspring-exports';
app/internal_packages/undo-redo/lib/main.ts:1:import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';
app/internal_packages/thread-list/lib/thread-permalink-handler.ts:4:import { localized, DatabaseStore, Thread, Matcher, Actions } from 'mailspring-exports';
app/internal_packages/send-and-archive/lib/send-and-archive-extension.ts:1:import { Actions, Thread, DatabaseStore, TaskFactory, SendDraftTask } from 'mailspring-exports';
app/internal_packages/activity/lib/dashboard/loading-cover.tsx:4:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/thread-list/lib/thread-list-toolbar.tsx:3:import { Thread } from 'mailspring-exports';
app/internal_packages/thread-list/lib/thread-list-toolbar.tsx:4:import { MultiselectToolbar } from 'mailspring-component-kit';
app/internal_packages/undo-redo/lib/undo-redo-toast.tsx:9:} from 'mailspring-exports';
app/internal_packages/undo-redo/lib/undo-redo-toast.tsx:10:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/activity/lib/dashboard/share-button.tsx:2:import { localized, MailspringAPIRequest } from 'mailspring-exports';
app/internal_packages/activity/lib/dashboard/share-button.tsx:3:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/activity/lib/dashboard/share-button.tsx:70:    const link = await MailspringAPIRequest.postStaticPage({
app/internal_packages/thread-list/lib/thread-list.tsx:12:} from 'mailspring-component-kit';
app/internal_packages/thread-list/lib/thread-list.tsx:29:} from 'mailspring-exports';
app/internal_packages/thread-list/lib/thread-list.tsx:243:    event.dataTransfer.setData('mailspring-threads-data', JSON.stringify(data));
app/internal_packages/thread-list/lib/thread-list.tsx:244:    event.dataTransfer.setData(`mailspring-accounts=${data.accountIds.join(',')}`, '1');
app/internal_packages/onboarding/lib/decorators/create-page-for-form.tsx:4:import { RetinaImg } from 'mailspring-component-kit';
app/internal_packages/onboarding/lib/decorators/create-page-for-form.tsx:5:import { localized, Account } from 'mailspring-exports';
app/internal_packages/composer-signature/lib/main.ts:6:} from 'mailspring-exports';
app/internal_packages/activity/lib/dashboard/timespan.ts:2:import { localized } from 'mailspring-exports';
app/internal_packages/main-calendar/lib/core/calendar-data-source.ts:11:} from 'mailspring-exports';
```

