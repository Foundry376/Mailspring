import _ from 'underscore';
import { localized, Message } from 'mailspring-exports';

export class Comparator {
  name: string;
  arrayMatchFn: any;
  fn: any;

  static get Default() {
    return new Comparator(
      {
        name: 'Default',
        arrayMatchFn: Array.prototype.some,
      },
      ({ actual, desired }) => _.isEqual(actual, desired)
    );
  }

  constructor({ name, arrayMatchFn }, fn) {
    this.name = name;
    this.fn = fn;
    this.arrayMatchFn = arrayMatchFn;
  }

  evaluate({ actual, desired }) {
    if (actual instanceof Array) {
      return this.arrayMatchFn.call(actual, item => this.fn({ actual: item, desired }));
    }
    return this.fn({ actual, desired });
  }
}

const Types = {
  None: 'None',
  Enum: 'Enum',
  String: 'String',
};

export const Comparators = {
  String: {
    contains: new Comparator(
      {
        name: localized('contains'),
        arrayMatchFn: Array.prototype.some,
      },
      ({ actual, desired }) => {
        if (!actual || !desired) {
          return false;
        }
        return actual.toLowerCase().includes(desired.toLowerCase());
      }
    ),

    doesNotContain: new Comparator(
      {
        name: localized('does not contain'),
        arrayMatchFn: Array.prototype.every,
      },
      ({ actual, desired }) => {
        if (!actual || !desired) {
          return false;
        }
        return !actual.toLowerCase().includes(desired.toLowerCase());
      }
    ),

    beginsWith: new Comparator(
      {
        name: localized('begins with'),
        arrayMatchFn: Array.prototype.some,
      },
      ({ actual, desired }) => {
        if (!actual || !desired) {
          return false;
        }
        return actual.toLowerCase().startsWith(desired.toLowerCase());
      }
    ),

    endsWith: new Comparator(
      {
        name: localized('ends with'),
        arrayMatchFn: Array.prototype.some,
      },
      ({ actual, desired }) => {
        if (!actual || !desired) {
          return false;
        }
        return actual.toLowerCase().endsWith(desired.toLowerCase());
      }
    ),

    equals: new Comparator(
      {
        name: localized('equals'),
        arrayMatchFn: Array.prototype.some,
      },
      ({ actual, desired }) => actual === desired
    ),

    matchesExpression: new Comparator(
      {
        name: localized('matches expression'),
        arrayMatchFn: Array.prototype.some,
      },
      ({ actual, desired }) => {
        if (!actual || !desired) {
          return false;
        }
        return new RegExp(desired, 'gi').test(actual);
      }
    ),
  },
};

export class Template {
  static Type = Types;
  static Comparator = Comparator;
  static Comparators = Comparators;

  key: string;
  name: string;
  type: string;
  values: string[] | undefined;
  valueLabel: string | undefined;
  valueForMessage?: (message: Message) => any;
  comparators: {};

  constructor(
    key,
    type,
    options: { name?: string; valueForMessage?: (message: Message) => any } = {}
  ) {
    this.key = key;
    this.type = type;

    const defaults = {
      name: this.key,
      values: undefined,
      valueLabel: undefined,
      comparators: Comparators[this.type] || {},
    };

    Object.assign(this, defaults, options);

    if (!this.key) {
      throw new Error('You must provide a valid key.');
    }
    if (!(this.type in Types)) {
      throw new Error('You must provide a valid type.');
    }
    if (this.type === Types.Enum && !this.values) {
      throw new Error('You must provide `values` when creating an enum.');
    }
  }

  createDefaultInstance() {
    return {
      templateKey: this.key,
      comparatorKey: Object.keys(this.comparators)[0],
      value: undefined,
    };
  }

  coerceInstance(instance) {
    instance.templateKey = this.key;
    if (!this.comparators) {
      instance.comparatorKey = undefined;
    } else if (!Object.keys(this.comparators).includes(instance.comparatorKey)) {
      instance.comparatorKey = Object.keys(this.comparators)[0];
    }
    return instance;
  }

  evaluate(instance, value) {
    let comparator = this.comparators[instance.comparatorKey];
    if (typeof comparator === 'undefined' || comparator === null) {
      comparator = Comparator.Default;
    }
    return comparator.evaluate({
      actual: value,
      desired: instance.value,
    });
  }
}
