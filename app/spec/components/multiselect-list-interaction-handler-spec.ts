const MultiselectListInteractionHandler = require('../../src/components/multiselect-list-interaction-handler');
import WorkspaceStore from '../../src/flux/stores/workspace-store';
import { Thread } from '../../src/flux/models/thread';
import _ from 'underscore';

describe('MultiselectListInteractionHandler', function() {
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
    this.dataSource = {
      selection: {
        toggle: jasmine.createSpy('toggle'),
        expandTo: jasmine.createSpy('expandTo'),
        walk: jasmine.createSpy('walk'),
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
      focusedId: 'focus',
      onFocusItem: this.onFocusItem,
      onSetCursorPosition: this.onSetCursorPosition,
    };

    this.collection = 'threads';
    this.isRootSheet = true;
    this.handler = new MultiselectListInteractionHandler(this.props);

    spyOn(WorkspaceStore, 'topSheet').and.callFake(() => ({ root: this.isRootSheet }));
  });

  it('should never show focus', function() {
    expect(this.handler.shouldShowFocus()).toEqual(false);
  });

  it('should always show the keyboard cursor', function() {
    expect(this.handler.shouldShowKeyboardCursor()).toEqual(true);
  });

  it('should always show checkmarks', function() {
    expect(this.handler.shouldShowCheckmarks()).toEqual(true);
  });

  describe('onClick', () =>
    it('should focus list items', function() {
      this.handler.onClick(this.item);
      expect(this.onFocusItem).toHaveBeenCalledWith(this.item);
    }));

  describe('onMetaClick', function() {
    it('shoud toggle selection', function() {
      this.handler.onMetaClick(this.item);
      expect(this.dataSource.selection.toggle).toHaveBeenCalledWith(this.item);
    });

    it('should focus the keyboard on the clicked item', function() {
      this.handler.onMetaClick(this.item);
      expect(this.onSetCursorPosition).toHaveBeenCalledWith(this.item);
    });
  });

  describe('onShiftClick', function() {
    it('should expand selection', function() {
      this.handler.onShiftClick(this.item);
      expect(this.dataSource.selection.expandTo).toHaveBeenCalledWith(this.item);
    });

    it('should focus the keyboard on the clicked item', function() {
      this.handler.onShiftClick(this.item);
      expect(this.onSetCursorPosition).toHaveBeenCalledWith(this.item);
    });
  });

  describe('onEnter', () =>
    it('should focus the item with the current keyboard selection', function() {
      this.handler.onEnter();
      expect(this.onFocusItem).toHaveBeenCalledWith(this.itemKeyboardFocus);
    }));

  describe('onSelectKeyboardItem (x key on keyboard)', function() {
    describe('on the root view', () =>
      it('should toggle the selection of the keyboard item', function() {
        this.isRootSheet = true;
        this.handler.onSelectKeyboardItem();
        expect(this.dataSource.selection.toggle).toHaveBeenCalledWith(this.itemKeyboardFocus);
      }));

    describe('on the thread view', () =>
      it('should toggle the selection of the focused item', function() {
        this.isRootSheet = false;
        this.handler.onSelectKeyboardItem();
        expect(this.dataSource.selection.toggle).toHaveBeenCalledWith(this.itemFocus);
      }));
  });

  describe('onShift', function() {
    describe('on the root view', function() {
      beforeEach(function() {
        this.isRootSheet = true;
      });

      it('should shift the keyboard item', function() {
        this.handler.onShift(1, {});
        expect(this.onSetCursorPosition).toHaveBeenCalledWith(this.itemAfterKeyboardFocus);
      });

      it('should walk selection if the select option is passed', function() {
        this.handler.onShift(1, { select: true });
        expect(this.dataSource.selection.walk).toHaveBeenCalledWith({
          current: this.itemKeyboardFocus,
          next: this.itemAfterKeyboardFocus,
        });
      });
    });

    describe('on the thread view', function() {
      beforeEach(function() {
        this.isRootSheet = false;
      });

      it('should shift the focused item', function() {
        this.handler.onShift(1, {});
        expect(this.onFocusItem).toHaveBeenCalledWith(this.itemAfterFocus);
      });
    });
  });
});
