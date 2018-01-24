/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const React = require('react');
const ComponentRegistry = require('../../src/registries/component-registry').default;

class TestComponent extends React.Component {
  static displayName = 'TestComponent';
}

class TestComponentNotSameIdentity extends React.Component {
  static displayName = 'TestComponent';
}

class TestComponentNoDisplayName extends React.Component {}

class AComponent extends React.Component {
  static displayName = 'A';
}

class BComponent extends React.Component {
  static displayName = 'B';
}

class CComponent extends React.Component {
  static displayName = 'C';
}

class DComponent extends React.Component {
  static displayName = 'D';
}

class EComponent extends React.Component {
  static displayName = 'E';
}

class FComponent extends React.Component {
  static displayName = 'F';
}

describe('ComponentRegistry', function() {
  beforeEach(() => ComponentRegistry._clear());

  describe('register', function() {
    it('throws an exception if passed a non-component', function() {
      expect(() => ComponentRegistry.register(null)).toThrow();
      expect(() => ComponentRegistry.register('cheese')).toThrow();
    });

    it('returns itself', () =>
      expect(ComponentRegistry.register(TestComponent, { role: 'bla' })).toBe(ComponentRegistry));

    it('does allow the exact same component to be redefined with different role/locations', function() {
      ComponentRegistry.register(TestComponent, { role: 'bla' });
      expect(() => ComponentRegistry.register(TestComponent, { role: 'other-role' })).not.toThrow();
    });

    it('does not allow components to be overridden by other components with the same displayName', function() {
      ComponentRegistry.register(TestComponent, { role: 'bla' });
      expect(() =>
        ComponentRegistry.register(TestComponentNotSameIdentity, { role: 'bla' })
      ).toThrow();
    });

    it('does not allow components to be registered without a displayName', () =>
      expect(() =>
        ComponentRegistry.register(TestComponentNoDisplayName, { role: 'bla' })
      ).toThrow());
  });

  describe('findComponentByName', function() {
    it('should return a component', function() {
      ComponentRegistry.register(TestComponent, { role: 'bla' });
      expect(ComponentRegistry.findComponentByName('TestComponent')).toEqual(TestComponent);
    });

    it('should return undefined if there is no component', () =>
      expect(ComponentRegistry.findComponentByName('not actually a name')).toBeUndefined());
  });

  describe('findComponentsMatching', function() {
    it('should throw if a descriptor is not provided', () =>
      expect(() => ComponentRegistry.findComponentsMatching()).toThrow());

    it('should return the correct results in a wide range of test cases', function() {
      const StubLocation1 = { id: 'StubLocation1' };
      const StubLocation2 = { id: 'StubLocation2' };
      ComponentRegistry.register(AComponent, { role: 'ThreadAction' });
      ComponentRegistry.register(BComponent, { role: 'ThreadAction', modes: ['list'] });
      ComponentRegistry.register(CComponent, { location: StubLocation1, modes: ['split'] });
      ComponentRegistry.register(DComponent, { locations: [StubLocation1, StubLocation2] });
      ComponentRegistry.register(EComponent, { roles: ['ThreadAction', 'MessageAction'] });
      ComponentRegistry.register(FComponent, { roles: ['MessageAction'], mode: 'list' });

      const scenarios = [
        { descriptor: { role: 'ThreadAction' }, results: [AComponent, BComponent, EComponent] },
        {
          descriptor: { role: 'ThreadAction', mode: 'list' },
          results: [AComponent, BComponent, EComponent],
        },
        { descriptor: { role: 'ThreadAction', mode: 'split' }, results: [AComponent, EComponent] },
        { descriptor: { location: StubLocation1 }, results: [CComponent, DComponent] },
        { descriptor: { location: StubLocation1, mode: 'list' }, results: [DComponent] },
        {
          descriptor: { locations: [StubLocation1, StubLocation2] },
          results: [CComponent, DComponent],
        },
        {
          descriptor: { roles: ['ThreadAction', 'MessageAction'] },
          results: [AComponent, BComponent, EComponent, FComponent],
        },
      ];

      scenarios.forEach(({ descriptor, results }) =>
        expect(ComponentRegistry.findComponentsMatching(descriptor)).toEqual(results)
      );
    });
  });

  describe('unregister', function() {
    it('unregisters the component if it exists', function() {
      ComponentRegistry.register(TestComponent, { role: 'bla' });
      ComponentRegistry.unregister(TestComponent);
      expect(ComponentRegistry.findComponentByName('TestComponent')).toBeUndefined();
    });

    it('throws if a string is passed instead of a component', () =>
      expect(() => ComponentRegistry.unregister('TestComponent')).toThrow());
  });
});
