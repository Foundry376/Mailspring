class AccountSidebarExtension {
  /**
   * @param accountIds
   * @return {
   *    id,
   *    name,
   *    iconName,
   *    perspective: {MailboxPerspective},
   *    insertAtTop: {Boolean} (optional),
   *    perAccount: {Boolean} (optional, default true) - when false, the item gets no
   *      per-account children in the unified "All Accounts" section,
   *    count: {Number} (optional) - badge shown on the item in place of the unread count.
   *      Call ExtensionRegistry.AccountSidebar.triggerDebounced() when it changes,
   * }
   */
  static sidebarItem() {}
}

export default AccountSidebarExtension;
