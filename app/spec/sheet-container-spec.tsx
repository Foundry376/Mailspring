import React from 'react';
import { CSSTransition } from 'react-transition-group';
import SheetContainer from '../src/sheet-container';
import { WorkspaceStore } from 'mailspring-exports';

describe('SheetContainer', () => {
  it('re-reads the window load settings when a hot window receives its window props', () => {
    let onWindowPropsReceived: () => void;
    const dispose = jasmine.createSpy('dispose');

    spyOn(AppEnv, 'onWindowPropsReceived').andCallFake((callback) => {
      onWindowPropsReceived = callback as () => void;
      return { dispose };
    });
    spyOn(WorkspaceStore, 'listen').andReturn(() => {});

    const container = new SheetContainer({});
    spyOn(container, 'setState');
    container.componentDidMount();

    onWindowPropsReceived();
    expect(container.setState).toHaveBeenCalled();

    container.componentWillUnmount();
    expect(dispose).toHaveBeenCalled();
  });

  describe('an unanimated stack change', () => {
    const root = { id: 'SpecRoot', root: true, supportedModes: ['list'] } as any;
    const pushed = { id: 'SpecPushed' } as any;
    let saved;

    beforeEach(() => {
      saved = WorkspaceStore.sheetStack().slice();
    });
    afterEach(() => {
      (WorkspaceStore as any)._sheetStack = saved;
    });

    it('replaces the stack in one change, unanimated for that change only', () => {
      // Stands in for the listeners, since other stores can't handle these stub sheets.
      const container = new SheetContainer({});
      const seen = [];
      spyOn(WorkspaceStore, 'trigger').andCallFake(() =>
        seen.push(container._getStateFromStores())
      );
      WorkspaceStore._onShowSheetStack([root, pushed]);

      expect(seen.length).toBe(1);
      expect(seen[0].stack).toEqual([root, pushed]);
      expect(seen[0].animate).toBe(false);
      expect(WorkspaceStore.stackChangeAnimates()).toBe(true);
    });

    it('switches root sheets without animating the pushed sheets out', () => {
      const container = new SheetContainer({});
      const seen = [];
      spyOn(WorkspaceStore, 'trigger').andCallFake(() =>
        seen.push(container._getStateFromStores())
      );
      WorkspaceStore._onSelectRootSheet(root);

      expect(seen.map((s) => [s.stack, s.animate])).toEqual([[[root], false]]);
      expect(WorkspaceStore.stackChangeAnimates()).toBe(true);
    });

    it('requires a root sheet at the bottom of the stack', () => {
      expect(() => WorkspaceStore._onShowSheetStack([pushed])).toThrow();
    });

    it('turns off both the entering and exiting sheet transitions', () => {
      const container = new SheetContainer({});
      const transition = <CSSTransition classNames="sheet-stack" timeout={125} />;
      container.state = { ...container.state, animate: false };
      const still = container._transitionChild(transition).props;
      expect([still.enter, still.exit]).toEqual([false, false]);
      container.state = { ...container.state, animate: true };
      const animated = container._transitionChild(transition).props;
      expect([animated.enter, animated.exit]).toEqual([true, true]);
    });
  });

  describe('double-clicking the toolbar on macOS', () => {
    let maximize: jasmine.Spy;
    const platform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      maximize = jasmine.createSpy('maximize');
      spyOn(AppEnv, 'getCurrentWindow').andReturn({
        isMaximized: () => false,
        maximize,
        unmaximize: () => {},
      } as any);
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: platform });
    });

    const doubleClick = (target: Element) => {
      const container = new SheetContainer({});
      container._onToolbarDoubleClick({ target } as any);
      container._onToolbarDoubleClick({ target } as any);
    };
    const inButton = (html: string) => {
      const button = document.createElement('button');
      button.innerHTML = html;
      return button.firstElementChild;
    };

    it('maximizes the window from empty toolbar space', () => {
      doubleClick(document.createElement('div'));
      expect(maximize).toHaveBeenCalled();
    });

    it("leaves it alone when the clicks land on a button's icon or label", () => {
      doubleClick(inButton('<img>'));
      doubleClick(inButton('<svg><path></path></svg>').querySelector('path'));
      doubleClick(inButton('<span class="text">New Event</span>'));
      const select = document.createElement('select');
      doubleClick(select);
      expect(maximize).not.toHaveBeenCalled();
    });
  });
});
