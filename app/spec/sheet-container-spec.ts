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
});
