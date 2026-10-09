import { Actions, FocusedContentStore, WorkspaceStore } from 'mailspring-exports';
import { ViewManifest } from '../lib/view-registry';
import { ViewsNavStore } from '../lib/views-nav';
import { emojiIcon, monogramFor, railViews, tooltipFor } from '../lib/nav/views-nav-rail';

const manifest = (over: Partial<ViewManifest>): ViewManifest => ({
  id: 'board',
  name: 'Board',
  placement: 'page',
  permissions: [],
  apiVersion: '2026-10-05',
  dir: '/tmp/board',
  source: 'installed',
  json: {},
  ...over,
});

describe('Views in the nav rail', function () {
  describe('railViews', function () {
    it("lists the user's page Views, installed or being tried, but not dev examples or sidebar Views", function () {
      const views = [
        manifest({ id: 'board' }),
        manifest({ id: 'trying', source: 'draft' }),
        manifest({ id: 'hello', source: 'example' }),
        manifest({ id: 'history', placement: 'thread-sidebar' }),
      ];
      expect(railViews(views).map((v) => v.id)).toEqual(['board', 'trying']);
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

    it('describes a View, and says when it is only a preview', function () {
      expect(tooltipFor(manifest({ json: { description: 'Sort conversations.' } }))).toEqual({
        title: 'Board',
        description: 'Sort conversations.',
      });
      expect(tooltipFor(manifest({ source: 'draft' })).description).toContain('Preview');
      expect(tooltipFor(manifest({})).description).toBeUndefined();
    });
  });

  describe('ViewsNavStore', function () {
    let root: any;

    beforeEach(function () {
      // The Views package defines its sheet when it activates, which specs don't do.
      if (!WorkspaceStore.Sheet.Views) {
        WorkspaceStore.defineSheet('Views', { root: true }, { list: ['ViewContent'] });
      }
      root = WorkspaceStore.Sheet.Threads;
      spyOn(WorkspaceStore, 'rootSheet').andCallFake(() => root);
      spyOn(WorkspaceStore, 'topSheet').andCallFake(() => root);
      spyOn(Actions, 'selectRootSheet').andCallFake((sheet) => {
        root = sheet;
      });
      spyOn(Actions, 'setFocus');
    });

    it('switches the main window to the Views sheet for a View, and reports it as focused', function () {
      ViewsNavStore.showView('board');
      expect(Actions.selectRootSheet).toHaveBeenCalledWith(WorkspaceStore.Sheet.Views);
      expect(ViewsNavStore.viewId()).toEqual('board');
      expect(ViewsNavStore.focusedPageViewId()).toEqual('board');
      expect(ViewsNavStore.isShowingHome()).toBe(false);
    });

    it("doesn't report a focused View while another section is showing", function () {
      ViewsNavStore.showView('board');
      root = WorkspaceStore.Sheet.Threads;
      expect(ViewsNavStore.focusedPageViewId()).toBe(null);
    });

    it('shows the home, and clears a thread a View had opened', function () {
      spyOn(FocusedContentStore, 'focused').andReturn({ id: 't1' });
      ViewsNavStore.showView('board');
      ViewsNavStore.showHome();
      expect(ViewsNavStore.viewId()).toBe(null);
      expect(ViewsNavStore.isShowingHome()).toBe(true);
      expect(Actions.setFocus).toHaveBeenCalledWith({ collection: 'thread', item: null });
    });

    it("doesn't reselect the sheet when it's already showing", function () {
      root = WorkspaceStore.Sheet.Views;
      ViewsNavStore.showView('board');
      expect(Actions.selectRootSheet).not.toHaveBeenCalled();
    });
  });
});
