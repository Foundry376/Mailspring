const MultiselectSplitInteractionHandler = require('../../src/components/multiselect-split-interaction-handler');
const WorkspaceStore = require('../../src/flux/stores/workspace-store');
const Thread = require('../../src/flux/models/thread').default;
const _ = require('underscore');

describe('MultiselectSplitInteractionHandler', function() {
  beforeEach(function() {
    this.item = new Thread({ id: '123' });
    this.itemFocus = new Thread({ id: 'focus' });
    this.itemKeyboardFocus = new Thread({ id: 'keyboard-focus' });
    this.itemAfterFocus = new Thread({ id: 'after-focus' });
    this.itemAfterKeyboardFocus = new Thread({ id: 'after-keyboard-focus' });

    const data = [
      this.item,
      this.itemFocus,
      this.itemAfterFocus,
      this.itemKeyboardFocus,
      this.itemAfterKeyboardFocus,
    ];

    this.onFocusItem = jasmine.createSpy('onFocusItem');
    this.onSetCursorPosition = jasmine.createSpy('onSetCursorPosition');
    this.selection = [];
    this.dataSource = {
      selection: {
        toggle: jasmine.createSpy('toggle'),
        expandTo: jasmine.createSpy('expandTo'),
        add: jasmine.createSpy('add'),
        walk: jasmine.createSpy('walk'),
        clear: jasmine.createSpy('clear'),
        count: () => this.selection.length,
        items: () => this.selection,
        top: () => this.selection[-1],
      },

      get(idx) {
        return data[idx];
      },
      getById(id) {
        return _.find(data, item => item.id === id);
      },
      indexOfId(id) {
        return _.findIndex(data, item => item.id === id);
      },
      count() {
        return data.length;
      },
    };

    this.props = {
      dataSource: this.dataSource,
      keyboardCursorId: 'keyboard-focus',
      focused: this.itemFocus,
      focusedId: 'focus',
      onFocusItem: this.onFocusItem,
      onSetCursorPosition: this.onSetCursorPosition,
    };

    this.collection = 'threads';
    this.isRootSheet = true;
    this.handler = new MultiselectSplitInteractionHandler(this.props);

    spyOn(WorkspaceStore, 'topSheet').andCallFake(() => ({ root: this.isRootSheet }));
  });

  it('should always show focus', function() {
    expect(this.handler.shouldShowFocus()).toEqual(true);
  });

  it('should show the keyboard cursor when multiple items are selected', function() {
    this.selection = [];
    expect(this.handler.shouldShowKeyboardCursor()).toEqual(false);
    this.selection = [this.item];
    expect(this.handler.shouldShowKeyboardCursor()).toEqual(false);
    this.selection = [this.item, this.itemFocus];
    expect(this.handler.shouldShowKeyboardCursor()).toEqual(true);
  });

  describe('onClick', () =>
    it('should focus the list item and indicate it was focused via click', function() {
      this.handler.onClick(this.item);
      expect(this.onFocusItem).toHaveBeenCalledWith(this.item);
    }));

  describe('onMetaClick', function() {
    describe('when there is currently a focused item', function() {
      it('should turn the focused item into the first selected item', function() {
        this.handler.onMetaClick(this.item);
        expect(this.dataSource.selection.add).toHaveBeenCalledWith(this.itemFocus);
      });

      it('should clear the focus', function() {
        this.handler.onMetaClick(this.item);
        expect(this.onFocusItem).toHaveBeenCalledWith(null);
      });
    });

    it('should toggle selection', function() {
      this.handler.onMetaClick(this.item);
      expect(this.dataSource.selection.toggle).toHaveBeenCalledWith(this.item);
    });

    it('should call _checkSelectionAndFocusConsistency', function() {
      spyOn(this.handler, '_checkSelectionAndFocusConsistency');
      this.handler.onMetaClick(this.item);
      expect(this.handler._checkSelectionAndFocusConsistency).toHaveBeenCalled();
    });
  });

  describe('onShiftClick', function() {
    describe('when there is currently a focused item', function() {
      it('should turn the focused item into the first selected item', function() {
        this.handler.onMetaClick(this.item);
        expect(this.dataSource.selection.add).toHaveBeenCalledWith(this.itemFocus);
      });

      it('should clear the focus', function() {
        this.handler.onMetaClick(this.item);
        expect(this.onFocusItem).toHaveBeenCalledWith(null);
      });
    });

    it('should expand selection', function() {
      this.handler.onShiftClick(this.item);
      expect(this.dataSource.selection.expandTo).toHaveBeenCalledWith(this.item);
    });

    it('should call _checkSelectionAndFocusConsistency', function() {
      spyOn(this.handler, '_checkSelectionAndFocusConsistency');
      this.handler.onMetaClick(this.item);
      expect(this.handler._checkSelectionAndFocusConsistency).toHaveBeenCalled();
    });
  });

  describe('onEnter', function() {});

  describe('onSelect (x key on keyboard)', () =>
    it('should call _checkSelectionAndFocusConsistency', function() {
      spyOn(this.handler, '_checkSelectionAndFocusConsistency');
      this.handler.onMetaClick(this.item);
      expect(this.handler._checkSelectionAndFocusConsistency).toHaveBeenCalled();
    }));

  describe('onShift', function() {
    it('should call _checkSelectionAndFocusConsistency', function() {
      spyOn(this.handler, '_checkSelectionAndFocusConsistency');
      this.handler.onMetaClick(this.item);
      expect(this.handler._checkSelectionAndFocusConsistency).toHaveBeenCalled();
    });

    describe('when the select option is passed', function() {
      it('should turn the existing focused item into a selected item', function() {
        this.handler.onShift(1, { select: true });
        expect(this.dataSource.selection.add).toHaveBeenCalledWith(this.itemFocus);
      });

      it('should walk the selection to the shift target', function() {
        this.handler.onShift(1, { select: true });
        expect(this.dataSource.selection.walk).toHaveBeenCalledWith({
          current: this.itemFocus,
          next: this.itemAfterFocus,
        });
      });
    });

    describe('when one or more items is selected', () =>
      it('should move the keyboard cursor', function() {
        this.selection = [this.itemFocus, this.itemAfterFocus, this.itemKeyboardFocus];
        this.handler.onShift(1, {});
        expect(this.onSetCursorPosition).toHaveBeenCalledWith(this.itemAfterKeyboardFocus);
      }));

    describe('when no items are selected', () =>
      it('should move the focus', function() {
        this.handler.onShift(1, {});
        expect(this.onFocusItem).toHaveBeenCalledWith(this.itemAfterFocus);
      }));
  });

  describe('_checkSelectionAndFocusConsistency', () =>
    describe('when only one item is selected', function() {
      beforeEach(function() {
        this.selection = [this.item];
        this.props.focused = null;
        this.handler = new MultiselectSplitInteractionHandler(this.props);
      });

      it('should clear the selection and make the item focused', function() {
        this.handler._checkSelectionAndFocusConsistency();
        expect(this.dataSource.selection.clear).toHaveBeenCalled();
        expect(this.onFocusItem).toHaveBeenCalledWith(this.item);
      });
    }));
});
