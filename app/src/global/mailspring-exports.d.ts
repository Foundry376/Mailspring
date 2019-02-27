
declare module "mailspring-exports" {
  export const localized: typeof import('../intl').localized; 
  export const localizedReactFragment: typeof import('../intl').localizedReactFragment; 
  export const getAvailableLanguages: typeof import('../intl').getAvailableLanguages; 
  export const isRTL: typeof import('../intl').isRTL; 
  
  // Actions
  export const Actions: typeof import('../flux/actions').default; 
  
  // API Endpoints
  export const MailspringAPIRequest: typeof import('../flux/mailspring-api-request').default; 
  export const MailsyncProcess: typeof import('../mailsync-process').default; 

  // The Database
  export const Matcher: import('../flux/attributes/matcher').default; 
  export const DatabaseStore: typeof import('../flux/stores/database-store').default; 
  export const QueryResultSet: import('../flux/models/query-result-set').default; 
  export const QuerySubscription: import('../flux/models/query-subscription').default; 
  export const MutableQueryResultSet: import('../flux/models/mutable-query-result-set').default; 
  export const QuerySubscriptionPool: typeof import('../flux/models/query-subscription-pool').default; 
  export const ObservableListDataSource: import('../flux/stores/observable-list-data-source').default; 
  export const MutableQuerySubscription: import('../flux/models/mutable-query-subscription').default; 
  
  // Database Objects
  export const DatabaseObjectRegistry: typeof import('../registries/database-object-registry').default; 
  export type Model = import('../flux/models/model').default
  export const Attributes: typeof import('../flux/attributes'); 
  export const File: import('../flux/models/file').default; 
  export const Event: import('../flux/models/event').default; 
  export const Label: import('../flux/models/label').default; 
  export const Folder: import('../flux/models/folder').default; 
  export const Thread: import('../flux/models/thread').default; 
  export const Account: import('../flux/models/account').default; 
  export const Message: import('../flux/models/message').default; 
  export const Contact: import('../flux/models/contact').default; 
  export const Category: import('../flux/models/category').default; 
  export const Calendar: import('../flux/models/calendar').default; 
  export const ProviderSyncbackRequest: typeof import('../flux/models/provider-syncback-request').default; 
  
  // Search Query Interfaces
  export const SearchQueryAST: typeof import('../services/search/search-query-ast');
  export const SearchQueryParser: typeof import('../services/search/search-query-parser').default;
  export const IMAPSearchQueryBackend: typeof import('../services/search/search-query-backend-imap');
  
  // Tasks
  export const TaskFactory: typeof import('../flux/tasks/task-factory').default;
  export const Task: typeof import('../flux/tasks/task').default;
  export const EventRSVPTask: typeof import('../flux/tasks/event-rsvp-task').default;
  export const SendDraftTask: typeof import('../flux/tasks/send-draft-task').default;
  export const ChangeMailTask: typeof import('../flux/tasks/change-mail-task').default;
  export const DestroyDraftTask: typeof import('../flux/tasks/destroy-draft-task').default;
  export const ChangeLabelsTask: typeof import('../flux/tasks/change-labels-task').default;
  export const ChangeFolderTask: typeof import('../flux/tasks/change-folder-task').default;
  export const ChangeUnreadTask: typeof import('../flux/tasks/change-unread-task').default;
  export const DestroyModelTask: typeof import('../flux/tasks/destroy-model-task').default;
  export const SyncbackDraftTask: typeof import('../flux/tasks/syncback-draft-task').default;
  export const ChangeStarredTask: typeof import('../flux/tasks/change-starred-task').default;
  export const SyncbackEventTask: typeof import('../flux/tasks/syncback-event-task').default;
  export const DestroyCategoryTask: typeof import('../flux/tasks/destroy-category-task').default;
  export const SyncbackCategoryTask: typeof import('../flux/tasks/syncback-category-task').default;
  export const SyncbackMetadataTask: typeof import('../flux/tasks/syncback-metadata-task').default;
  export const GetMessageRFC2822Task: typeof import('../flux/tasks/get-message-rfc2822-task').default;
  export const ExpungeAllInFolderTask: typeof import('../flux/tasks/expunge-all-in-folder-task').default;
  export const ChangeRoleMappingTask: typeof import('../flux/tasks/change-role-mapping-task').default;
  export const SendFeatureUsageEventTask: typeof import('../flux/tasks/send-feature-usage-event-task').default;
  
  // Stores
  // These need to be required immediately since some Stores are
  // listen-only and not explicitly required from anywhere. Stores
  // currently set themselves up on require.
  export const TaskQueue: typeof import('../flux/stores/task-queue').default;
  export const BadgeStore: typeof import('../flux/stores/badge-store').default;
  export const DraftStore: typeof import('../flux/stores/draft-store').default;
  export const DraftEditingSession: typeof import('../flux/stores/draft-editing-session').default;
  export const DraftFactory: typeof import('../flux/stores/draft-factory').default;
  export const ModalStore: typeof import('../flux/stores/modal-store').default;
  export const OutboxStore: typeof import('../flux/stores/outbox-store').default;
  export const PopoverStore: typeof import('../flux/stores/popover-store').default;
  export const AccountStore: typeof import('../flux/stores/account-store').default;
  export const SignatureStore: typeof import('../flux/stores/signature-store').default;
  export const MessageStore: typeof import('../flux/stores/message-store').default;
  export const ContactStore: typeof import('../flux/stores/contact-store').default;
  export const IdentityStore: typeof import('../flux/stores/identity-store').default;
  export const CategoryStore: typeof import('../flux/stores/category-store').default;
  export const UndoRedoStore: typeof import('../flux/stores/undo-redo-store').default;
  export const WorkspaceStore: typeof import('../flux/stores/workspace-store').default;
  export const MailRulesStore: typeof import('../flux/stores/mail-rules-store').default;
  export const SendActionsStore: typeof import('../flux/stores/send-actions-store').default;
  export const FeatureUsageStore: typeof import('../flux/stores/feature-usage-store').default;
  export const ThreadCountsStore: typeof import('../flux/stores/thread-counts-store').default;
  export const AttachmentStore: typeof import('../flux/stores/attachment-store').default;
  export const OnlineStatusStore: typeof import('../flux/stores/online-status-store').default;
  export const UpdateChannelStore: typeof import('../flux/stores/update-channel-store').default;
  export const PreferencesUIStore: typeof import('../flux/stores/preferences-ui-store').default;
  export const FocusedContentStore: typeof import('../flux/stores/focused-content-store').default;
  export const MessageBodyProcessor: typeof import('../flux/stores/message-body-processor').default;
  export const FocusedContactsStore: typeof import('../flux/stores/focused-contacts-store').default;
  export const FolderSyncProgressStore: typeof import('../flux/stores/folder-sync-progress-store').default;
  export const FocusedPerspectiveStore: typeof import('../flux/stores/focused-perspective-store').default;
  export const SearchableComponentStore: typeof import('../flux/stores/searchable-component-store').default;
  
  export const ServiceRegistry: typeof import('../registries/service-registry').default;
  
  // Decorators
  export const InflatesDraftClientId: typeof import('../decorators/inflates-draft-client-id').default;
  
  // Extensions
  export const ExtensionRegistry: typeof import('../registries/extension-registry');
  export const MessageViewExtension: typeof import('../extensions/message-view-extension').default;
  export const ComposerExtension: typeof import('../extensions/composer-extension').default;
  
  // 3rd party libraries
  export const Rx: typeof import('rx-lite');
  export const React: typeof import('react');
  export const ReactDOM: typeof import('react-dom');
  export const ReactTestUtils: typeof import('react-dom/test-utils');
  export const PropTypes: typeof import('prop-types');
  
  // React Components
  export const ComponentRegistry: typeof import('../registries/component-registry').default;
  
  // Utils
  export const Utils: typeof import('../flux/models/utils');
  export const DOMUtils: typeof import('../dom-utils').default;
  export const DateUtils: typeof import('../date-utils').default;
  export const FsUtils: typeof import('../fs-utils');
  export const CanvasUtils: typeof import('../canvas-utils');
  export const RegExpUtils: typeof import('../regexp-utils').default;
  export const MenuHelpers: typeof import('../menu-helpers');
  export const VirtualDOMUtils: typeof import('../virtual-dom-utils').default;
  export const Spellchecker: typeof import('../spellchecker').default;
  export const MessageUtils: typeof import('../flux/models/message-utils').default;
  
  // Services
  export const KeyManager: typeof import('../key-manager').default;
  export const SoundRegistry: typeof import('../registries/sound-registry').default;
  export const MailRulesTemplates: typeof import('../mail-rules-templates');
  export const MailRulesProcessor: typeof import('../mail-rules-processor').default;
  export const MailboxPerspective: typeof import('../mailbox-perspective').default;
  export const NativeNotifications: typeof import('../native-notifications').default;
  export const SanitizeTransformer: typeof import('../services/sanitize-transformer').default;
  export const QuotedHTMLTransformer: typeof import('../services/quoted-html-transformer').default;
  export const InlineStyleTransformer: typeof import('../services/inline-style-transformer').default;
  export const SearchableComponentMaker: typeof import('../searchable-components/searchable-component-maker').default;
  
  // Errors
  export const APIError: typeof import('../flux/errors').APIError;
  
  // Process Internals
  export const DefaultClientHelper: typeof import('../default-client-helper').default;
  export const SystemStartService: typeof import('../system-start-service').default;
  
  // Testing
  export const MailspringTestUtils: typeof import('../../spec/mailspring-test-utils').default;
}
