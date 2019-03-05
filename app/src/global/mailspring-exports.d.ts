
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
  export * from '../mailsync-process' 

  // The Database
  export * from '../flux/attributes/matcher'; 
  export type DatabaseStore = typeof import('../flux/stores/database-store').default;
  export const DatabaseStore: DatabaseStore; 
  export * from '../flux/models/query-result-set';
  export * from '../flux/models/query-subscription';
  export * from '../flux/models/mutable-query-result-set'
  export type QuerySubscriptionPool = typeof import('../flux/models/query-subscription-pool').default;
  export const QuerySubscriptionPool: QuerySubscriptionPool; 
  export * from '../flux/stores/observable-list-data-source';
  export * from '../flux/models/mutable-query-subscription'

  // Database Objects
  export type DatabaseObjectRegistry = typeof import('../registries/database-object-registry').default;
  export const DatabaseObjectRegistry: DatabaseObjectRegistry; 
  export * from '../flux/models/model'
  export type Attributes = typeof import('../flux/attributes');
  export const Attributes: Attributes; 
  export * from '../flux/models/file'
  export * from '../flux/models/event'
  export * from '../flux/models/label'
  export * from '../flux/models/folder'
  export * from '../flux/models/thread'
  export * from '../flux/models/account';
  export * from '../flux/models/message'
  export * from '../flux/models/contact'
  export * from '../flux/models/category'
  export * from '../flux/models/calendar'
  export type ProviderSyncbackRequest = import('../flux/models/provider-syncback-request').default;
  export const ProviderSyncbackRequest: ProviderSyncbackRequest; 

  // Search Query Interfaces
  export type SearchQueryAST = typeof import('../services/search/search-query-ast');
  export const SearchQueryAST: SearchQueryAST;
  export * from '../services/search/search-query-parser';
  export type IMAPSearchQueryBackend = import('../services/search/search-query-backend-imap').default;
  export const IMAPSearchQueryBackend: IMAPSearchQueryBackend;

  // Tasks
  export * from '../flux/tasks/task'
  export * from '../flux/tasks/task-factory'
  export * from '../flux/tasks/event-rsvp-task'
  export * from '../flux/tasks/send-draft-task'
  export * from '../flux/tasks/change-mail-task'
  export * from '../flux/tasks/destroy-draft-task'
  export * from '../flux/tasks/change-labels-task'
  export * from '../flux/tasks/change-folder-task'
  export * from '../flux/tasks/change-unread-task'
  export * from '../flux/tasks/destroy-model-task'
  export * from '../flux/tasks/syncback-draft-task'
  export * from '../flux/tasks/change-starred-task'
  export * from '../flux/tasks/syncback-event-task'
  export * from '../flux/tasks/destroy-category-task'
  export * from '../flux/tasks/syncback-category-task'
  export * from '../flux/tasks/syncback-metadata-task'
  export * from '../flux/tasks/get-message-rfc2822-task'
  export * from '../flux/tasks/expunge-all-in-folder-task'
  export * from '../flux/tasks/change-role-mapping-task'
  export * from '../flux/tasks/send-feature-usage-event-task'
  
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
  export * from '../flux/stores/account-store'
  export * from '../flux/stores/signature-store'
  export * from '../flux/stores/message-store'
  export type ContactStore = typeof import('../flux/stores/contact-store').default;
  export const ContactStore: ContactStore;
  export * from '../flux/stores/identity-store';
  export type CategoryStore = typeof import('../flux/stores/category-store').default;
  export const CategoryStore: CategoryStore;
  export type UndoRedoStore = typeof import('../flux/stores/undo-redo-store').default;
  export const UndoRedoStore: UndoRedoStore;
  export type WorkspaceStore = typeof import('../flux/stores/workspace-store').default;
  export const WorkspaceStore: WorkspaceStore;
  export type MailRulesStore = typeof import('../flux/stores/mail-rules-store').default;
  export const MailRulesStore: MailRulesStore;
  export * from '../flux/stores/send-actions-store'
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
  export * from '../flux/stores/preferences-ui-store'
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
  export * from '../extensions/message-view-extension'
  export * from '../extensions/composer-extension'
  
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
  export * from '../mailbox-perspective'
  export type NativeNotifications = typeof import('../native-notifications').default;
  export const NativeNotifications: NativeNotifications;
  export type SanitizeTransformer = typeof import('../services/sanitize-transformer').default;
  export const SanitizeTransformer: SanitizeTransformer;
  export type QuotedHTMLTransformer = typeof import('../services/quoted-html-transformer').default;
  export const QuotedHTMLTransformer: QuotedHTMLTransformer;
  export type InlineStyleTransformer = typeof import('../services/inline-style-transformer').default;
  export const InlineStyleTransformer: InlineStyleTransformer;
  export * from '../searchable-components/searchable-component-maker'

  // Errors
  export * from '../flux/errors';

  // Process Internals
  export * from '../default-client-helper'
  export type SystemStartService = typeof import('../system-start-service').default;
  export const SystemStartService: SystemStartService;

  // Testing
  export type MailspringTestUtils = typeof import('../../spec/mailspring-test-utils').default;
  export const MailspringTestUtils: MailspringTestUtils;