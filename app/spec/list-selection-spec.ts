const _ = require('underscore');

const { Thread } = require('mailspring-exports');
const { ListTabular } = require('mailspring-component-kit');

const ListDataSource = ListTabular.DataSource;
const ListSelection = ListTabular.Selection;

describe('ListSelection', function() {
  beforeEach(function() {
    this.trigger = jasmine.createSpy('trigger');

    this.items = [];
    for (let ii = 0; ii <= 99; ii++) {
      this.items.push(new Thread({ id: `${ii}` }));
    }

    this.view = new ListDataSource();
    this.view.indexOfId = jasmine.createSpy('indexOfId').andCallFake(id => {
      return _.findIndex(this.items, _.matcher({ id }));
    });
    this.view.get = jasmine.createSpy('get').andCallFake(idx => {
      return this.items[idx];
    });

    this.selection = new ListSelection(this.view, this.trigger);
  });

  it('should initialize with an empty set', function() {
    expect(this.selection.items()).toEqual([]);
    expect(this.selection.ids()).toEqual([]);
  });

  it('should throw an exception if a view is not provided', function() {
    expect(() => new ListSelection(null, this.trigger)).toThrow();
  });

  describe('set', function() {
    it('should replace the current selection with the provided models', function() {
      this.selection.set([this.items[2], this.items[4], this.items[7]]);
      expect(this.selection.ids()).toEqual(['2', '4', '7']);
      this.selection.set([this.items[2], this.items[5], this.items[6]]);
      expect(this.selection.ids()).toEqual(['2', '5', '6']);
    });

    it('should throw an exception if the items passed are not models', function() {
      expect(() => this.selection.set(['hi'])).toThrow();
    });

    it('should trigger', function() {
      this.selection.set([this.items[2], this.items[4], this.items[7]]);
      expect(this.trigger).toHaveBeenCalled();
    });
  });

  describe('clear', function() {
    beforeEach(function() {
      this.selection.set([this.items[2]]);
    });

    it('should empty the selection set', function() {
      this.selection.clear();
      expect(this.selection.ids()).toEqual([]);
    });

    it('should trigger', function() {
      this.selection.clear();
      expect(this.trigger).toHaveBeenCalled();
    });
  });

  describe('remove', function() {
    beforeEach(function() {
      this.selection.set([this.items[2], this.items[4], this.items[7]]);
    });

    it('should do nothing if called without a valid item', function() {
      this.selection.remove(null);
      this.selection.remove(undefined);
      this.selection.remove(false);
      expect(this.selection.ids()).toEqual(['2', '4', '7']);
    });

    it('should remove the item from the set', function() {
      this.selection.remove(this.items[2]);
      expect(this.selection.ids()).toEqual(['4', '7']);
    });

    it('should throw an exception if any item passed is not a model', function() {
      expect(() => this.selection.remove('hi')).toThrow();
    });

    it('should accept an array of models as well as a single item', function() {
      this.selection.remove([this.items[2], this.items[4]]);
      expect(this.selection.ids()).toEqual(['7']);
    });

    it('should trigger', function() {
      this.selection.remove();
      expect(this.trigger).toHaveBeenCalled();
    });
  });

  describe('_applyChangeRecord', function() {
    it('should replace items in the selection with the matching provided items, if present', function() {
      this.selection.set([this.items[2], this.items[4], this.items[7]]);
      expect(this.selection.items()[0]).toBe(this.items[2]);
      expect(this.selection.items()[0].subject).toBe(undefined);
      const newItem2 = new Thread({ id: '2', subject: 'Hello world!' });
      this.selection._applyChangeRecord({
        objectClass: 'Thread',
        objects: [newItem2],
        type: 'persist',
      });
      expect(this.selection.items()[0].subject).toBe('Hello world!');
    });

    it('should rremove items in the selection if type is unpersist', function() {
      this.selection.set([this.items[2], this.items[4], this.items[7]]);
      const newItem2 = new Thread({ id: '2', subject: 'Hello world!' });
      this.selection._applyChangeRecord({
        objectClass: 'Thread',
        objects: [newItem2],
        type: 'unpersist',
      });
      expect(this.selection.ids()).toEqual(['4', '7']);
    });
  });

  describe('toggle', function() {
    beforeEach(function() {
      this.selection.set([this.items[2]]);
    });

    it('should do nothing if called without a valid item', function() {
      this.selection.toggle(null);
      this.selection.toggle(undefined);
      this.selection.toggle(false);
      expect(this.selection.ids()).toEqual(['2']);
    });

    it('should throw an exception if the item passed is not a model', function() {
      expect(() => this.selection.toggle('hi')).toThrow();
    });

    it('should select the item if it is not selected', function() {
      this.selection.toggle(this.items[3]);
      expect(this.selection.ids()).toEqual(['2', '3']);
    });

    it('should de-select the item if it is selected', function() {
      this.selection.toggle(this.items[2]);
      expect(this.selection.ids()).toEqual([]);
    });

    it('should trigger', function() {
      this.selection.toggle(this.items[2]);
      expect(this.trigger).toHaveBeenCalled();
    });
  });

  describe('expandTo', function() {
    it('should select the item, if no other items are selected', function() {
      this.selection.clear();
      this.selection.expandTo(this.items[2]);
      expect(this.selection.ids()).toEqual(['2']);
    });

    it('should do nothing if called without a valid item', function() {
      this.selection.expandTo(null);
      this.selection.expandTo(undefined);
      this.selection.expandTo(false);
      expect(this.selection.ids()).toEqual([]);
    });

    it('should throw an exception if the item passed is not a model', function() {
      expect(() => this.selection.expandTo('hi')).toThrow();
    });

    it('should select all items from the last selected item to the provided item when the provided item is below the current selection', function() {
      this.selection.set([this.items[2], this.items[5]]);
      this.selection.expandTo(this.items[8]);
      expect(this.selection.ids()).toEqual(['2', '5', '6', '7', '8']);
    });

    it('should select all items from the last selected item to the provided item when the provided item is above the current selection', function() {
      this.selection.set([this.items[7], this.items[5]]);
      this.selection.expandTo(this.items[2]);
      expect(this.selection.ids()).toEqual(['7', '5', '4', '3', '2']);
    });

    it('should not do anything if the provided item is not in the view set', function() {
      this.selection.set([this.items[2]]);
      this.selection.expandTo(new Thread({ id: 'not-in-view!' }));
      expect(this.selection.ids()).toEqual(['2']);
    });

    it('should re-order items so that the order still reflects the order selection actions were taken', function() {
      this.selection.set([this.items[10], this.items[4], this.items[1]]);
      this.selection.expandTo(this.items[8]);
      expect(this.selection.ids()).toEqual(['10', '1', '2', '3', '4', '5', '6', '7', '8']);
    });

    it('should trigger', function() {
      this.selection.set([this.items[5], this.items[4], this.items[1]]);
      this.selection.expandTo(this.items[8]);
      expect(this.trigger).toHaveBeenCalled();
    });
  });

  describe('walk', function() {
    beforeEach(function() {
      this.selection.set([this.items[2]]);
    });

    it('should trigger', function() {
      const current = this.items[4];
      const next = this.items[5];
      this.selection.walk({ current, next });
      expect(this.trigger).toHaveBeenCalled();
    });

    it('should select both items if neither the start row or the end row are selected', function() {
      const current = this.items[4];
      const next = this.items[5];
      this.selection.walk({ current, next });
      expect(this.selection.ids()).toEqual(['2', '4', '5']);
    });

    it('should select only one item if either current or next is null or undefined', function() {
      let current = null;
      let next = this.items[5];
      this.selection.walk({ current, next });
      expect(this.selection.ids()).toEqual(['2', '5']);

      next = null;
      current = this.items[7];
      this.selection.walk({ current, next });
      expect(this.selection.ids()).toEqual(['2', '5', '7']);
    });

    describe('when the `next` item is a step backwards in the selection history', () =>
      it('should deselect the current item', function() {
        this.selection.set([this.items[2], this.items[3], this.items[4], this.items[5]]);
        const current = this.items[5];
        const next = this.items[4];
        this.selection.walk({ current, next });
        expect(this.selection.ids()).toEqual(['2', '3', '4']);
      }));

    describe('otherwise', function() {
      it('should select the next item', function() {
        this.selection.set([this.items[2], this.items[3], this.items[4], this.items[5]]);
        const current = this.items[5];
        const next = this.items[6];
        this.selection.walk({ current, next });
        expect(this.selection.ids()).toEqual(['2', '3', '4', '5', '6']);
      });

      describe('if the item was already selected', () =>
        it('should re-order the selection array so the selection still represents selection history', function() {
          this.selection.set([this.items[5], this.items[8], this.items[7], this.items[6]]);
          expect(this.selection.ids()).toEqual(['5', '8', '7', '6']);

          const current = this.items[6];
          const next = this.items[5];
          this.selection.walk({ current, next });
          expect(this.selection.ids()).toEqual(['8', '7', '6', '5']);
        }));
    });
  });
});
