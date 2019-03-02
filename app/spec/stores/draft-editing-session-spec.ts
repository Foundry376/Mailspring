/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { Message } from '../../src/flux/models/message';
import Actions from '../../src/flux/actions';
import DatabaseStore from '../../src/flux/stores/database-store';
import DraftEditingSession from '../../src/flux/stores/draft-editing-session';
const { DraftChangeSet } = DraftEditingSession;
import _ from 'underscore';

xdescribe('DraftEditingSession Specs', function() {
  describe('DraftChangeSet', function() {
    beforeEach(function() {
      this.onDidAddChanges = jasmine.createSpy('onDidAddChanges');
      this.onWillAddChanges = jasmine.createSpy('onWillAddChanges');
      this.commitResolve = null;
      this.commitResolves = [];
      this.onCommit = jasmine.createSpy('commit').and.callFake(() => {
        new Promise((resolve, reject) => {
          this.commitResolves.push(resolve);
          this.commitResolve = resolve;
        });
      });

      this.changeSet = new DraftChangeSet({
        onDidAddChanges: this.onDidAddChanges,
        onWillAddChanges: this.onWillAddChanges,
        onCommit: this.onCommit,
      });
      this.changeSet._pending = { subject: 'Change to subject line' };
    });

    describe('teardown', () =>
      it('should remove all of the pending and saving changes', function() {
        this.changeSet.teardown();
        expect(this.changeSet._saving).toEqual({});
        expect(this.changeSet._pending).toEqual({});
      }));

    describe('add', function() {
      it('should mark that the draft is not pristine', function() {
        this.changeSet.add({ body: 'Hello World!' });
        expect(this.changeSet._pending.pristine).toEqual(false);
      });

      it('should add the changes to the _pending set', function() {
        this.changeSet.add({ body: 'Hello World!' });
        expect(this.changeSet._pending.body).toEqual('Hello World!');
      });

      describe('otherwise', () =>
        it('should commit after thirty seconds', function() {
          spyOn(this.changeSet, 'commit');
          this.changeSet.add({ body: 'Hello World!' });
          expect(this.changeSet.commit).not.toHaveBeenCalled();
          advanceClock(31000);
          expect(this.changeSet.commit).toHaveBeenCalled();
        }));
    });

    describe('commit', function() {
      it('should resolve immediately if the pending set is empty', function() {
        this.changeSet._pending = {};
        waitsForPromise(() => {
          return this.changeSet.commit().then(() => {
            expect(this.onCommit).not.toHaveBeenCalled();
          });
        });
      });

      it('should move changes to the saving set', function() {
        const pendingBefore = Object.assign({}, this.changeSet._pending);
        expect(this.changeSet._saving).toEqual({});
        this.changeSet.commit();
        advanceClock();
        expect(this.changeSet._pending).toEqual({});
        expect(this.changeSet._saving).toEqual(pendingBefore);
      });

      it('should call the commit handler and then clear the saving set', function() {
        this.changeSet.commit();
        advanceClock();
        expect(this.changeSet._saving).not.toEqual({});
        this.commitResolve();
        advanceClock();
        expect(this.changeSet._saving).toEqual({});
      });

      describe('concurrency', () =>
        it('the commit function should always run serially', function() {
          let firstFulfilled = false;
          let secondFulfilled = false;

          this.changeSet._pending = { subject: 'A' };
          this.changeSet.commit().then(() => {
            this.changeSet._pending = { subject: 'B' };
            firstFulfilled = true;
          });
          this.changeSet.commit().then(() => {
            secondFulfilled = true;
          });

          advanceClock();
          expect(firstFulfilled).toBe(false);
          expect(secondFulfilled).toBe(false);
          this.commitResolves[0]();
          advanceClock();
          expect(firstFulfilled).toBe(true);
          expect(secondFulfilled).toBe(false);
          this.commitResolves[1]();
          advanceClock();
          expect(firstFulfilled).toBe(true);
          expect(secondFulfilled).toBe(true);
        }));
    });
  });

  describe('DraftEditingSession', function() {
    describe('constructor', function() {
      it('should make a query to fetch the draft', function() {
        spyOn(DatabaseStore, 'run').and.callFake(() => {
          return new Promise((resolve, reject) => {});
        });
        const session = new DraftEditingSession('client-id');
        expect(DatabaseStore.run).toHaveBeenCalled();
      });

      describe('when given a draft object', function() {
        beforeEach(function() {
          spyOn(DatabaseStore, 'run');
          this.draft = new Message({ draft: true, body: '123' });
          this.session = new DraftEditingSession('client-id', this.draft);
        });

        it('should not make a query for the draft', () =>
          expect(DatabaseStore.run).not.toHaveBeenCalled());

        it('prepare should resolve without querying for the draft', function() {
          waitsForPromise(() =>
            this.session.prepare().then(() => {
              expect(this.session.draft()).toBeDefined();
              expect(DatabaseStore.run).not.toHaveBeenCalled();
            })
          );
        });
      });
    });

    describe('prepare', function() {
      beforeEach(function() {
        this.draft = new Message({ draft: true, body: '123', id: 'client-id' });
        spyOn(DraftEditingSession.prototype, 'prepare');
        this.session = new DraftEditingSession('client-id');
        spyOn(this.session, '_setDraft').andCallThrough();
        spyOn(DatabaseStore, 'run').and.callFake(modelQuery => {
          return Promise.resolve(this.draft);
        });
        jasmine.unspy(DraftEditingSession.prototype, 'prepare');
      });

      it('should call setDraft with the retrieved draft', function() {
        waitsForPromise(() => {
          return this.session.prepare().then(() => {
            expect(this.session._setDraft).toHaveBeenCalledWith(this.draft);
          });
        });
      });

      it('should resolve with the DraftEditingSession', function() {
        waitsForPromise(() => {
          return this.session.prepare().then(val => {
            expect(val).toBe(this.session);
          });
        });
      });

      describe('error handling', function() {
        it('should reject if the draft session has already been destroyed', function() {
          waitsForPromise(() => {
            return this.session
              .prepare()
              .then(() => {
                expect(false).toBe(true);
              })
              .catch(val => {
                expect(val instanceof Error).toBe(true);
              });
          });
        });

        it('should reject if the draft cannot be found', function() {
          this.draft = null;
          waitsForPromise(() => {
            return this.session
              .prepare()
              .then(() => {
                expect(false).toBe(true);
              })
              .catch(val => {
                expect(val instanceof Error).toBe(true);
              });
          });
        });
      });
    });

    describe('when a draft changes', function() {
      beforeEach(function() {
        this.draft = new Message({ draft: true, id: 'client-id', body: 'A', subject: 'initial' });
        this.session = new DraftEditingSession('client-id', this.draft);
        advanceClock();

        spyOn(Actions, 'queueTask').and.returnValue(Promise.resolve());
      });

      it('should ignore the update unless it applies to the current draft', function() {
        spyOn(this.session, 'trigger');
        this.session._onDraftChanged({ objectClass: 'message', objects: [new Message()] });
        expect(this.session.trigger).not.toHaveBeenCalled();
        this.session._onDraftChanged({ objectClass: 'message', objects: [this.draft] });
        expect(this.session.trigger).toHaveBeenCalled();
      });

      it('should apply the update to the current draft', function() {
        const updatedDraft = this.draft.clone();
        updatedDraft.subject = 'This is the new subject';
        spyOn(this.session, '_setDraft');

        this.session._onDraftChanged({ objectClass: 'message', objects: [updatedDraft] });
        expect(this.session._setDraft).toHaveBeenCalled();
        const draft = this.session._setDraft.calls[0].args[0];
        expect(draft.subject).toEqual(updatedDraft.subject);
      });

      it('atomically commits changes', function() {
        spyOn(DatabaseStore, 'run').and.returnValue(Promise.resolve(this.draft));
        spyOn(DatabaseStore, 'inTransaction').andCallThrough();
        this.session.changes.add({ body: '123' });
        waitsForPromise(() => {
          return this.session.changes.commit().then(() => {
            expect(DatabaseStore.inTransaction).toHaveBeenCalled();
            expect(DatabaseStore.inTransaction.calls.length).toBe(1);
          });
        });
      });

      it('persist the applied changes', function() {
        spyOn(DatabaseStore, 'run').and.returnValue(Promise.resolve(this.draft));
        this.session.changes.add({ body: '123' });
        waitsForPromise(() => {
          return this.session.changes.commit().then(() => {
            expect(updated.body).toBe('123');
          });
        });
      });

      describe('when findBy does not return a draft', () =>
        it("continues and persists it's local draft reference, so it is resaved and draft editing can continue", function() {
          spyOn(DatabaseStore, 'run').and.returnValue(Promise.resolve(null));
          this.session.changes.add({ body: '123' });
          waitsForPromise(() => {
            return this.session.changes.commit().then(() => {
              expect(updated.body).toBe('123');
            });
          });
        }));

      it('does nothing if the draft is marked as destroyed', function() {
        spyOn(DatabaseStore, 'run').and.returnValue(Promise.resolve(this.draft));
        spyOn(DatabaseStore, 'inTransaction').andCallThrough();
        return waitsForPromise(() => {
          this.session.changes.add({ body: '123' });
          return this.session.changes.commit().then(() => {
            expect(DatabaseStore.inTransaction).not.toHaveBeenCalled();
          });
        });
      });
    });
  });
});
