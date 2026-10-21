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
