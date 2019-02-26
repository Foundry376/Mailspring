const FocusedContactsStore = require('../../src/flux/stores/focused-contacts-store');

xdescribe('FocusedContactsStore', function() {
  beforeEach(function() {
    FocusedContactsStore._currentThreadId = null;
    FocusedContactsStore._clearCurrentParticipants({ silent: true });
  });

  it('returns no contacts with empty', () =>
    expect(FocusedContactsStore.sortedContacts()).toEqual([]));

  it('returns no focused contact when empty', () =>
    expect(FocusedContactsStore.focusedContact()).toBeNull());
});
