import { ComposerEditor } from '../../../src/components/composer-editor/composer-editor';

describe('ComposerEditor while locked', () => {
  const keyEvent = (key: string, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    ...mods,
    preventDefault: jasmine.createSpy('preventDefault'),
  });

  const editorWith = (locked: boolean) => {
    const component = new ComposerEditor({ locked } as any);
    (component as any).props = { locked };
    return component;
  };

  it('refuses keys that would edit the body', () => {
    const component = editorWith(true);
    for (const [key, mods] of [
      ['a', {}],
      ['Z', {}],
      ['Backspace', {}],
      ['Enter', {}],
      ['Tab', {}],
      ['v', { metaKey: true }],
      ['z', { ctrlKey: true }],
      ['b', { metaKey: true }],
    ] as const) {
      const event = keyEvent(key, mods);
      const next = jasmine.createSpy('next');
      component.onKeyDown(event as any, null, next);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('lets navigation, copy and select-all through', () => {
    const component = editorWith(true);
    for (const [key, mods] of [
      ['ArrowLeft', {}],
      ['End', {}],
      ['Escape', {}],
      ['c', { metaKey: true }],
      ['a', { metaKey: true }],
    ] as const) {
      const event = keyEvent(key, mods);
      const next = jasmine.createSpy('next');
      component.onKeyDown(event as any, null, next);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    }
  });

  it('refuses paste, cut, typed input and selection changes only while locked', () => {
    const handler = jasmine.createSpy('handler');
    for (const locked of [true, false]) {
      handler.reset();
      const wrapped = editorWith(locked).unlessLocked(handler);
      const event = { preventDefault: jasmine.createSpy('preventDefault') };
      wrapped(event, null, () => {});
      expect(event.preventDefault.callCount).toBe(locked ? 1 : 0);
      expect(handler.callCount).toBe(locked ? 0 : 1);
    }
  });

  it('passes every key through when not locked', () => {
    const event = keyEvent('a');
    const next = jasmine.createSpy('next');
    editorWith(false).onKeyDown(event as any, null, next);
    expect(next).toHaveBeenCalled();
  });
});
