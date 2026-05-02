/**
 * Public: This keeps track of constructors so we know how to inflate
 * serialized objects.
 *
 * We map constructor string names with factory functions that will return
 * the actual constructor itself.
 *
 * The reason we have an extra function call to return a constructor is so
 * we don't need to `require` all constructors at once on load. We are
 * wasting a very large amount of time on bootup requiring files that may
 * never be used or only used way down the line.
 *
 * If 3rd party packages want to register new inflatable models, they can
 * use `register` and pass the constructor generator along with the name.
 *
 * Note that there is one registry per window.
 */
export default class SerializableRegistry {
  _constructorFactories = {};

  get(name: string) {
    return this._constructorFactories[name].call(null);
  }

  getAllConstructors() {
    const constructors = [];
    for (const name of Object.keys(this._constructorFactories)) {
      constructors.push(this.get(name));
    }
    return constructors;
  }

  isInRegistry(name: string) {
    return !!this._constructorFactories[name];
  }

  deserialize(name: string, dataJSON: string | object) {
    let data = dataJSON;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }

    const constructor = this.get(name);

    if (typeof constructor !== 'function') {
      throw new Error(`Unsure of how to inflate ${JSON.stringify(data)}. \
Your constructor factory must return a class constructor.`);
    }

    const object = new constructor();
    object.fromJSON(data);

    return object;
  }

  register(name: string, constructorFactory: () => new (...args: unknown[]) => unknown) {
    this._constructorFactories[name] = constructorFactory;
  }

  unregister(name: string) {
    delete this._constructorFactories[name];
  }
}
