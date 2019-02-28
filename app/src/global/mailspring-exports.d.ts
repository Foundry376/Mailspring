
  export type localized = typeof import('../intl').localized;
  export const localized: localized; 
  export type localizedReactFragment = typeof import('../intl').localizedReactFragment;
  export const localizedReactFragment: localizedReactFragment; 
  export type getAvailableLanguages = typeof import('../intl').getAvailableLanguages;
  export const getAvailableLanguages: getAvailableLanguages; 
  export type isRTL = typeof import('../intl').isRTL;
  export const isRTL: isRTL; 

  // Actions
  export type Actions = typeof import('../flux/actions').default;
  export const Actions: Actions; 

  // API Endpoints
  export type MailspringAPIRequest = typeof import('../flux/mailspring-api-request').default;
  export const MailspringAPIRequest: MailspringAPIRequest; 
  export type MailsyncProcess = import('../mailsync-process').default;
  export const MailsyncProcess: MailsyncProcess; 

  // The Database
  export const Matcher: import('../flux/attributes/matcher').default; 
  export type DatabaseStore = typeof import('../flux/stores/database-store').default;
  export const DatabaseStore: DatabaseStore; 
  export * from '../flux/models/query-result-set';
  export type QuerySubscription = import('../flux/models/query-subscription').default;
  export const QuerySubscription: QuerySubscription; 
  export type MutableQueryResultSet = import('../flux/models/mutable-query-result-set').default;
  export const MutableQueryResultSet: MutableQueryResultSet; 
  export type QuerySubscriptionPool = typeof import('../flux/models/query-subscription-pool').default;
  export const QuerySubscriptionPool: QuerySubscriptionPool; 
  export * from '../flux/stores/observable-list-data-source';
  export type MutableQuerySubscription = import('../flux/models/mutable-query-subscription').default;
  export const MutableQuerySubscription: MutableQuerySubscription; 

  // Database Objects
  export type DatabaseObjectRegistry = typeof import('../registries/database-object-registry').default;
  export const DatabaseObjectRegistry: DatabaseObjectRegistry; 
  export type Model = import('../flux/models/model').default
  export const Model: Model;
  export type Attributes = typeof import('../flux/attributes');
  export const Attributes: Attributes; 
  export type File = import('../flux/models/file').default;
  export const File: File; 
  export type Event = import('../flux/models/event').default;
  export const Event: Event; 
  export type Label = import('../flux/models/label').default;
  export const Label: Label; 
  export type Folder = import('../flux/models/folder').default;
  export const Folder: Folder; 
  export type Thread = import('../flux/models/thread').default;
  export const Thread: Thread; 
  export type Account = import('../flux/models/account').default;
  export const Account: Account; 
  export type Message = import('../flux/models/message').default;
  export const Message: Message; 
  export type Contact = import('../flux/models/contact').default;
  export const Contact: Contact; 
  export type Category = import('../flux/models/category').default;
  export const Category: Category; 
  export type Calendar = import('../flux/models/calendar').default;
  export const Calendar: Calendar; 
  export type ProviderSyncbackRequest = import('../flux/models/provider-syncback-request').default;
  export const ProviderSyncbackRequest: ProviderSyncbackRequest; 

  // Search Query Interfaces
  export type SearchQueryAST = typeof import('../services/search/search-query-ast');
  export const SearchQueryAST: SearchQueryAST;
  export type SearchQueryParser = import('../services/search/search-query-parser').default;
  export const SearchQueryParser: SearchQueryParser;
  export type IMAPSearchQueryBackend = import('../services/search/search-query-backend-imap').default;
  export const IMAPSearchQueryBackend: IMAPSearchQueryBackend;

  // Tasks
  export type TaskFactory = typeof import('../flux/tasks/task-factory');
  export const TaskFactory: TaskFactory;
  export type Task = typeof import('../flux/tasks/task').default;
  export const Task: Task;
  export type EventRSVPTask = import('../flux/tasks/event-rsvp-task').default;
  export const EventRSVPTask: EventRSVPTask;
  export type SendDraftTask = import('../flux/tasks/send-draft-task').default;
  export const SendDraftTask: SendDraftTask;
  export type ChangeMailTask = import('../flux/tasks/change-mail-task').default;
  export const ChangeMailTask: ChangeMailTask;
  export type DestroyDraftTask = import('../flux/tasks/destroy-draft-task').default;
  export const DestroyDraftTask: DestroyDraftTask;
  export type ChangeLabelsTask = import('../flux/tasks/change-labels-task').default;
  export const ChangeLabelsTask: ChangeLabelsTask;
  export type ChangeFolderTask = import('../flux/tasks/change-folder-task').default;
  export const ChangeFolderTask: ChangeFolderTask;
  export type ChangeUnreadTask = import('../flux/tasks/change-unread-task').default;
  export const ChangeUnreadTask: ChangeUnreadTask;
  export type DestroyModelTask = import('../flux/tasks/destroy-model-task').default;
  export const DestroyModelTask: DestroyModelTask;
  export type SyncbackDraftTask = import('../flux/tasks/syncback-draft-task').default;
  export const SyncbackDraftTask: SyncbackDraftTask;
  export type ChangeStarredTask = import('../flux/tasks/change-starred-task').default;
  export const ChangeStarredTask: ChangeStarredTask;
  export type SyncbackEventTask = import('../flux/tasks/syncback-event-task').default;
  export const SyncbackEventTask: SyncbackEventTask;
  export type DestroyCategoryTask = import('../flux/tasks/destroy-category-task').default;
  export const DestroyCategoryTask: DestroyCategoryTask;
  export type SyncbackCategoryTask = import('../flux/tasks/syncback-category-task').default;
  export const SyncbackCategoryTask: SyncbackCategoryTask;
  export type SyncbackMetadataTask = import('../flux/tasks/syncback-metadata-task').default;
  export const SyncbackMetadataTask: SyncbackMetadataTask;
  export type GetMessageRFC2822Task = import('../flux/tasks/get-message-rfc2822-task').default;
  export const GetMessageRFC2822Task: GetMessageRFC2822Task;
  export type ExpungeAllInFolderTask = import('../flux/tasks/expunge-all-in-folder-task').default;
  export const ExpungeAllInFolderTask: ExpungeAllInFolderTask;
  export type ChangeRoleMappingTask = import('../flux/tasks/change-role-mapping-task').default;
  export const ChangeRoleMappingTask: ChangeRoleMappingTask;
  export type SendFeatureUsageEventTask = import('../flux/tasks/send-feature-usage-event-task').default;
  export const SendFeatureUsageEventTask: SendFeatureUsageEventTask;

  // Stores
  // These need to be required immediately since some Stores are
  // listen-only and not explicitly required from anywhere. Stores
  // currently set themselves up on require.
  export type TaskQueue = typeof import('../flux/stores/task-queue').default;
  export const TaskQueue: TaskQueue;
  export type BadgeStore = typeof import('../flux/stores/badge-store').default;
  export const BadgeStore: BadgeStore;
  export type DraftStore = typeof import('../flux/stores/draft-store').default;
  export const DraftStore: DraftStore;
  export type DraftEditingSession = import('../flux/stores/draft-editing-session').default;
  export const DraftEditingSession: DraftEditingSession;
  export type DraftFactory = typeof import('../flux/stores/draft-factory').default;
  export const DraftFactory: DraftFactory;
  export type ModalStore = typeof import('../flux/stores/modal-store').default;
  export const ModalStore: ModalStore;
  export type OutboxStore = typeof import('../flux/stores/outbox-store').default;
  export const OutboxStore: OutboxStore;
  export type PopoverStore = typeof import('../flux/stores/popover-store').default;
  export const PopoverStore: PopoverStore;
  export type AccountStore = typeof import('../flux/stores/account-store').default;
  export const AccountStore: AccountStore;
  export type SignatureStore = typeof import('../flux/stores/signature-store').default;
  export const SignatureStore: SignatureStore;
  export type MessageStore = typeof import('../flux/stores/message-store').default;
  export const MessageStore: MessageStore;
  export type ContactStore = typeof import('../flux/stores/contact-store').default;
  export const ContactStore: ContactStore;
  export type IdentityStore = typeof import('../flux/stores/identity-store').default;
  export const IdentityStore: IdentityStore;
  export type CategoryStore = typeof import('../flux/stores/category-store').default;
  export const CategoryStore: CategoryStore;
  export type UndoRedoStore = typeof import('../flux/stores/undo-redo-store').default;
  export const UndoRedoStore: UndoRedoStore;
  export type WorkspaceStore = typeof import('../flux/stores/workspace-store').default;
  export const WorkspaceStore: WorkspaceStore;
  export type MailRulesStore = typeof import('../flux/stores/mail-rules-store').default;
  export const MailRulesStore: MailRulesStore;
  export type SendActionsStore = typeof import('../flux/stores/send-actions-store').default;
  export const SendActionsStore: SendActionsStore;
  export type FeatureUsageStore = typeof import('../flux/stores/feature-usage-store').default;
  export const FeatureUsageStore: FeatureUsageStore;
  export type ThreadCountsStore = typeof import('../flux/stores/thread-counts-store').default;
  export const ThreadCountsStore: ThreadCountsStore;
  export type AttachmentStore = typeof import('../flux/stores/attachment-store').default;
  export const AttachmentStore: AttachmentStore;
  export type OnlineStatusStore = typeof import('../flux/stores/online-status-store').default;
  export const OnlineStatusStore: OnlineStatusStore;
  export type UpdateChannelStore = typeof import('../flux/stores/update-channel-store').default;
  export const UpdateChannelStore: UpdateChannelStore;
  export type PreferencesUIStore = typeof import('../flux/stores/preferences-ui-store').default;
  export const PreferencesUIStore: PreferencesUIStore;
  export type FocusedContentStore = typeof import('../flux/stores/focused-content-store').default;
  export const FocusedContentStore: FocusedContentStore;
  export type MessageBodyProcessor = typeof import('../flux/stores/message-body-processor').default;
  export const MessageBodyProcessor: MessageBodyProcessor;
  export type FocusedContactsStore = typeof import('../flux/stores/focused-contacts-store').default;
  export const FocusedContactsStore: FocusedContactsStore;
  export type FolderSyncProgressStore = typeof import('../flux/stores/folder-sync-progress-store').default;
  export const FolderSyncProgressStore: FolderSyncProgressStore;
  export type FocusedPerspectiveStore = typeof import('../flux/stores/focused-perspective-store').default;
  export const FocusedPerspectiveStore: FocusedPerspectiveStore;
  export type SearchableComponentStore = typeof import('../flux/stores/searchable-component-store').default;
  export const SearchableComponentStore: SearchableComponentStore;

  export type ServiceRegistry = typeof import('../registries/service-registry').default;
  export const ServiceRegistry: ServiceRegistry;

  // Decorators
  export type InflatesDraftClientId = typeof import('../decorators/inflates-draft-client-id').default;
  export const InflatesDraftClientId: InflatesDraftClientId;

  // Extensions
  export type ExtensionRegistry = typeof import('../registries/extension-registry');
  export const ExtensionRegistry: ExtensionRegistry;
  export type MessageViewExtension = import('../extensions/message-view-extension').default;
  export const MessageViewExtension: MessageViewExtension;
  export type ComposerExtension = import('../extensions/composer-extension').default;
  export const ComposerExtension: ComposerExtension;

  // 3rd party libraries
  export type Rx = typeof import('rx-lite');
  export const Rx: Rx;
  export type React = typeof import('react');
  export const React: React;
  export type ReactDOM = typeof import('react-dom');
  export const ReactDOM: ReactDOM;
  export type ReactTestUtils = typeof import('react-dom/test-utils');
  export const ReactTestUtils: ReactTestUtils;
  export type PropTypes = typeof import('prop-types');
  export const PropTypes: PropTypes;

  // React Components
  export type ComponentRegistry = typeof import('../registries/component-registry').default;
  export const ComponentRegistry: ComponentRegistry;

  // Utils
  export type Utils = typeof import('../flux/models/utils');
  export const Utils: Utils;
  export type DOMUtils = typeof import('../dom-utils').default;
  export const DOMUtils: DOMUtils;
  export type DateUtils = typeof import('../date-utils').default;
  export const DateUtils: DateUtils;
  export type FsUtils = typeof import('../fs-utils');
  export const FsUtils: FsUtils;
  export type CanvasUtils = typeof import('../canvas-utils');
  export const CanvasUtils: CanvasUtils;
  export type RegExpUtils = typeof import('../regexp-utils').default;
  export const RegExpUtils: RegExpUtils;
  export type MenuHelpers = typeof import('../menu-helpers');
  export const MenuHelpers: MenuHelpers;
  export type VirtualDOMUtils = typeof import('../virtual-dom-utils').default;
  export const VirtualDOMUtils: VirtualDOMUtils;
  export type Spellchecker = typeof import('../spellchecker').default;
  export const Spellchecker: Spellchecker;
  export type MessageUtils = typeof import('../flux/models/message-utils').default;
  export const MessageUtils: MessageUtils;

  // Services
  export type KeyManager = typeof import('../key-manager').default;
  export const KeyManager: KeyManager;
  export type SoundRegistry = typeof import('../registries/sound-registry').default;
  export const SoundRegistry: SoundRegistry;
  export type MailRulesTemplates = typeof import('../mail-rules-templates');
  export const MailRulesTemplates: MailRulesTemplates;
  export type MailRulesProcessor = typeof import('../mail-rules-processor').default;
  export const MailRulesProcessor: MailRulesProcessor;
  export type MailboxPerspective = import('../mailbox-perspective').default;
  export const MailboxPerspective: MailboxPerspective;
  export type NativeNotifications = typeof import('../native-notifications').default;
  export const NativeNotifications: NativeNotifications;
  export type SanitizeTransformer = typeof import('../services/sanitize-transformer').default;
  export const SanitizeTransformer: SanitizeTransformer;
  export type QuotedHTMLTransformer = typeof import('../services/quoted-html-transformer').default;
  export const QuotedHTMLTransformer: QuotedHTMLTransformer;
  export type InlineStyleTransformer = typeof import('../services/inline-style-transformer').default;
  export const InlineStyleTransformer: InlineStyleTransformer;
  export type SearchableComponentMaker = import('../searchable-components/searchable-component-maker').default;
  export const SearchableComponentMaker: SearchableComponentMaker;

  // Errors
  export type APIError = import('../flux/errors').APIError;
  export const APIError: APIError;

  // Process Internals
  export type DefaultClientHelper = typeof import('../default-client-helper');
  export const DefaultClientHelper: DefaultClientHelper;
  export type SystemStartService = typeof import('../system-start-service').default;
  export const SystemStartService: SystemStartService;

  // Testing
  export type MailspringTestUtils = typeof import('../../spec/mailspring-test-utils').default;
  export const MailspringTestUtils: MailspringTestUtils;