import { Actions, FocusedContentStore, WorkspaceStore } from 'mailspring-exports';
import { ViewManifest } from '../lib/view-registry';
import { ViewsNavStore } from '../lib/views-nav';
import { emojiIcon, monogramFor, railViews, tooltipFor } from '../lib/nav/views-nav-rail';

const manifest = (over: Partial<ViewManifest>): ViewManifest => ({
  id: 'board',
  name: 'Board',
  placement: 'page',
  permissions: [],
  apiVersion: '2026-10-20',
  dir: '/tmp/board',
  source: 'user',
  built: true,
  json: {},
  ...over,
});

describe('Views in the nav rail', function () {
  describe('railViews', function () {
    it('lists pinned page Views in pin order, skipping sidebar Views and missing ids', function () {
      const views = [
        manifest({ id: 'board' }),
        manifest({ id: 'unpinned' }),
        manifest({ id: 'hello', source: 'example' }),
        manifest({ id: 'history', placement: 'thread-sidebar' }),
      ];
      const pinned = ['hello', 'history', 'removed', 'board'];
      expect(railViews(views, pinned).map((v) => v.id)).toEqual(['hello', 'board']);
    });
  });

  describe('icons and tooltips', function () {
    it('accepts a short emoji icon and falls back to a monogram otherwise', function () {
      expect(emojiIcon('📦')).toEqual('📦');
      expect(emojiIcon('☀️')).toEqual('☀️');
      expect(emojiIcon('Package')).toBe(null);
      expect(emojiIcon('<svg>…')).toBe(null);
      expect(emojiIcon(42)).toBe(null);
      const m = monogramFor('rides & receipts');
      expect(m.letter).toEqual('R');
      expect(monogramFor('rides & receipts').background).toEqual(m.background);
    });

    it('describes a View from its manifest', function () {
      expect(tooltipFor(manifest({ json: { description: 'Sort conversations.' } }))).toEqual({
        title: 'Board',
        description: 'Sort conversations.',
      });
      expect(tooltipFor(manifest({})).description).toBeUndefined();
    });
  });

  describe('ViewsNavStore', function () {
    let stack: any[];

    beforeEach(function () {
      // The Views package defines its sheets when it activates, which specs don't do.
      if (!WorkspaceStore.Sheet.Views) {
        WorkspaceStore.defineSheet('Views', { root: true }, { list: ['ViewContent'] });
      }
      if (!WorkspaceStore.Sheet.ViewPage) {
        WorkspaceStore.defineSheet('ViewPage', {}, { list: ['ViewPageContent'] });
      }
      stack = [WorkspaceStore.Sheet.Threads];
      spyOn(WorkspaceStore, 'rootSheet').andCallFake(() => stack[0]);
      spyOn(WorkspaceStore, 'topSheet').andCallFake(() => stack[stack.length - 1]);
      spyOn(WorkspaceStore, 'sheetStack').andCallFake(() => stack);
      spyOn(Actions, 'selectRootSheet').andCallFake((sheet) => {
        stack = [sheet];
        ViewsNavStore._onWorkspaceChanged();
      });
      spyOn(Actions, 'popToRootSheet').andCallFake(() => {
        stack = stack.slice(0, 1);
        ViewsNavStore._onWorkspaceChanged();
      });
      spyOn(Actions, 'pushSheet').andCallFake((sheet) => {
        stack = [...stack, sheet];
        ViewsNavStore._onWorkspaceChanged();
      });
      spyOn(Actions, 'showSheetStack').andCallFake((sheets) => {
        stack = [...sheets];
        ViewsNavStore._onWorkspaceChanged();
      });
      spyOn(Actions, 'setFocus');
      ViewsNavStore.showHome();
      stack = [WorkspaceStore.Sheet.Threads];
      ViewsNavStore._onWorkspaceChanged();
    });

    it('pushes a View over the Views home, so Back returns home', function () {
      ViewsNavStore.showView('board');
      expect(stack).toEqual([WorkspaceStore.Sheet.Views, WorkspaceStore.Sheet.ViewPage]);
      expect(ViewsNavStore.viewId()).toEqual('board');
      expect(ViewsNavStore.focusedPageViewId()).toEqual('board');
      expect(ViewsNavStore.isShowingHome()).toBe(false);
    });

    it('forgets the View when its sheet is popped', function () {
      ViewsNavStore.showView('board');
      stack = [WorkspaceStore.Sheet.Views];
      ViewsNavStore._onWorkspaceChanged();
      expect(ViewsNavStore.viewId()).toBe(null);
      expect(ViewsNavStore.isShowingHome()).toBe(true);
    });

    it("doesn't report a focused View while another section is showing", function () {
      ViewsNavStore.showView('board');
      stack = [WorkspaceStore.Sheet.Threads];
      ViewsNavStore._onWorkspaceChanged();
      expect(ViewsNavStore.focusedPageViewId()).toBe(null);
    });

    it('switches between Views by replacing the pushed View', function () {
      ViewsNavStore.showView('board');
      ViewsNavStore.showView('rides');
      expect(stack).toEqual([WorkspaceStore.Sheet.Views, WorkspaceStore.Sheet.ViewPage]);
      expect(ViewsNavStore.viewId()).toEqual('rides');
    });

    it('can open a View with the home beneath it in one unanimated stack change', function () {
      ViewsNavStore.showView('board', { animate: false });
      expect(Actions.showSheetStack).toHaveBeenCalledWith([
        WorkspaceStore.Sheet.Views,
        WorkspaceStore.Sheet.ViewPage,
      ]);
      expect(Actions.pushSheet).not.toHaveBeenCalled();
      expect(stack).toEqual([WorkspaceStore.Sheet.Views, WorkspaceStore.Sheet.ViewPage]);
      expect(ViewsNavStore.viewId()).toEqual('board');
    });

    it('switches between Views without an animation, keeping the pushed sheet', function () {
      ViewsNavStore.showView('board', { animate: false });
      ViewsNavStore.showView('rides', { animate: false });
      expect(stack).toEqual([WorkspaceStore.Sheet.Views, WorkspaceStore.Sheet.ViewPage]);
      expect(ViewsNavStore.viewId()).toEqual('rides');
    });

    it('shows the home, and clears a thread a View had opened', function () {
      spyOn(FocusedContentStore, 'focused').andReturn({ id: 't1' });
      ViewsNavStore.showView('board');
      ViewsNavStore.showHome();
      expect(stack).toEqual([WorkspaceStore.Sheet.Views]);
      expect(ViewsNavStore.viewId()).toBe(null);
      expect(Actions.setFocus).toHaveBeenCalledWith({ collection: 'thread', item: null });
    });
  });
});
