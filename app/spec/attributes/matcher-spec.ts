import { Thread } from '../../src/flux/models/thread';
import { Model } from '../../src/flux/models/model';
import {
  Matcher,
  OrCompositeMatcher,
  AndCompositeMatcher,
} from '../../src/flux/attributes/matcher';
import * as Attributes from '../../src/flux/attributes';

// Build a simple Attribute and a simple model class for evaluate() tests
// so we don't depend on Thread's specific attribute names.
const strAttr = Attributes.String({ modelKey: 'name', queryable: true });
const numAttr = Attributes.Number({ modelKey: 'count', queryable: true });
const boolAttr = Attributes.Boolean({ modelKey: 'active', queryable: true });

class SimpleModel extends Model {
  name: string;
  count: number;
  active: boolean;
  tags: string[];
  static attributes = {
    ...Model.attributes,
    name: strAttr,
    count: numAttr,
    active: boolAttr,
  };
}

function model(props: Partial<SimpleModel> = {}) {
  const m = new SimpleModel({});
  Object.assign(m, props);
  return m;
}

describe('Matcher', function matcherSpecs() {
  beforeEach(() => {
    // Reset the global muid counter so tests are deterministic
    Matcher.muid = 0;
  });

  // ---------------------------------------------------------------------------
  // evaluate()
  // ---------------------------------------------------------------------------
  describe('evaluate()', () => {
    describe('= comparator', () => {
      it('returns true when values are equal', () => {
        const matcher = new Matcher(strAttr, '=', 'hello');
        expect(matcher.evaluate(model({ name: 'hello' }))).toBe(true);
      });

      it('returns false when values differ', () => {
        const matcher = new Matcher(strAttr, '=', 'hello');
        expect(matcher.evaluate(model({ name: 'world' }))).toBe(false);
      });

      it('uses loose equality so boolean true equals 1', () => {
        const matcher = new Matcher(boolAttr, '=', true);
        // loose == comparison: true == 1 is true in JS
        const m = new SimpleModel({});
        (m as any).active = 1;
        expect(matcher.evaluate(m)).toBe(true);
      });
    });

    describe('!= comparator', () => {
      it('returns true when values differ', () => {
        const matcher = new Matcher(strAttr, '!=', 'hello');
        expect(matcher.evaluate(model({ name: 'world' }))).toBe(true);
      });

      it('returns false when values are equal', () => {
        const matcher = new Matcher(strAttr, '!=', 'hello');
        expect(matcher.evaluate(model({ name: 'hello' }))).toBe(false);
      });
    });

    describe('< comparator', () => {
      it('returns true when model value is less than matcher value', () => {
        const matcher = new Matcher(numAttr, '<', 10);
        expect(matcher.evaluate(model({ count: 5 }))).toBe(true);
      });

      it('returns false when model value is equal', () => {
        const matcher = new Matcher(numAttr, '<', 10);
        expect(matcher.evaluate(model({ count: 10 }))).toBe(false);
      });

      it('returns false when model value is greater', () => {
        const matcher = new Matcher(numAttr, '<', 10);
        expect(matcher.evaluate(model({ count: 15 }))).toBe(false);
      });
    });

    describe('> comparator', () => {
      it('returns true when model value is greater than matcher value', () => {
        const matcher = new Matcher(numAttr, '>', 10);
        expect(matcher.evaluate(model({ count: 15 }))).toBe(true);
      });

      it('returns false when model value is equal or less', () => {
        const matcher = new Matcher(numAttr, '>', 10);
        expect(matcher.evaluate(model({ count: 10 }))).toBe(false);
        expect(matcher.evaluate(model({ count: 5 }))).toBe(false);
      });
    });

    describe('<= comparator', () => {
      it('returns true when model value is less than or equal to matcher value', () => {
        const matcher = new Matcher(numAttr, '<=', 10);
        expect(matcher.evaluate(model({ count: 9 }))).toBe(true);
        expect(matcher.evaluate(model({ count: 10 }))).toBe(true);
      });

      it('returns false when model value exceeds matcher value', () => {
        const matcher = new Matcher(numAttr, '<=', 10);
        expect(matcher.evaluate(model({ count: 11 }))).toBe(false);
      });
    });

    describe('>= comparator', () => {
      it('returns true when model value is greater than or equal to matcher value', () => {
        const matcher = new Matcher(numAttr, '>=', 10);
        expect(matcher.evaluate(model({ count: 11 }))).toBe(true);
        expect(matcher.evaluate(model({ count: 10 }))).toBe(true);
      });

      it('returns false when model value is below matcher value', () => {
        const matcher = new Matcher(numAttr, '>=', 10);
        expect(matcher.evaluate(model({ count: 9 }))).toBe(false);
      });
    });

    describe('in comparator', () => {
      it('returns true when model value is in the array', () => {
        const matcher = new Matcher(strAttr, 'in', ['a', 'b', 'c']);
        expect(matcher.evaluate(model({ name: 'b' }))).toBe(true);
      });

      it('returns false when model value is not in the array', () => {
        const matcher = new Matcher(strAttr, 'in', ['a', 'b', 'c']);
        expect(matcher.evaluate(model({ name: 'z' }))).toBe(false);
      });
    });

    describe('not in comparator', () => {
      it('returns true when model value is not in the array', () => {
        const matcher = new Matcher(strAttr, 'not in', ['a', 'b', 'c']);
        expect(matcher.evaluate(model({ name: 'z' }))).toBe(true);
      });

      it('returns false when model value is in the array', () => {
        const matcher = new Matcher(strAttr, 'not in', ['a', 'b', 'c']);
        expect(matcher.evaluate(model({ name: 'a' }))).toBe(false);
      });
    });

    describe('contains comparator', () => {
      it('returns true when the model array contains the matcher value (by string equality)', () => {
        const collectionAttr = Attributes.Collection({
          modelKey: 'tags',
          itemClass: Model,
          queryable: true,
        });

        class TagModel extends Model {
          tags: string[];
        }

        const matcher = new Matcher(collectionAttr, 'contains', 'inbox');
        const m = new TagModel({});
        (m as any).tags = ['inbox', 'sent'];
        expect(matcher.evaluate(m)).toBe(true);
      });

      it('returns false when the model array does not contain the matcher value', () => {
        const collectionAttr = Attributes.Collection({
          modelKey: 'tags',
          itemClass: Model,
          queryable: true,
        });

        class TagModel extends Model {
          tags: string[];
        }

        const matcher = new Matcher(collectionAttr, 'contains', 'trash');
        const m = new TagModel({});
        (m as any).tags = ['inbox', 'sent'];
        expect(matcher.evaluate(m)).toBe(false);
      });

      it('matches by id when items are objects with an id property', () => {
        const collectionAttr = Attributes.Collection({
          modelKey: 'tags',
          itemClass: Model,
          queryable: true,
        });

        class TagModel extends Model {
          tags: Array<{ id: string }>;
        }

        const matcher = new Matcher(collectionAttr, 'contains', 'cat-1');
        const m = new TagModel({});
        (m as any).tags = [{ id: 'cat-1' }, { id: 'cat-2' }];
        expect(matcher.evaluate(m)).toBe(true);
      });
    });

    describe('containsAny comparator', () => {
      it('returns true when the model array contains any of the matcher values', () => {
        const collectionAttr = Attributes.Collection({
          modelKey: 'tags',
          itemClass: Model,
          queryable: true,
        });

        class TagModel extends Model {
          tags: string[];
        }

        const matcher = new Matcher(collectionAttr, 'containsAny', ['inbox', 'archive']);
        const m = new TagModel({});
        (m as any).tags = ['sent', 'inbox'];
        expect(matcher.evaluate(m)).toBe(true);
      });

      it('returns false when no matcher values are in the model array', () => {
        const collectionAttr = Attributes.Collection({
          modelKey: 'tags',
          itemClass: Model,
          queryable: true,
        });

        class TagModel extends Model {
          tags: string[];
        }

        const matcher = new Matcher(collectionAttr, 'containsAny', ['inbox', 'archive']);
        const m = new TagModel({});
        (m as any).tags = ['sent', 'drafts'];
        expect(matcher.evaluate(m)).toBe(false);
      });
    });

    describe('startsWith comparator', () => {
      it('returns true when the model value starts with the matcher value', () => {
        const matcher = new Matcher(strAttr, 'startsWith', 'hel');
        expect(matcher.evaluate(model({ name: 'hello' }))).toBe(true);
      });

      it('returns false when the model value does not start with the matcher value', () => {
        const matcher = new Matcher(strAttr, 'startsWith', 'wor');
        expect(matcher.evaluate(model({ name: 'hello' }))).toBe(false);
      });
    });

    describe('like comparator', () => {
      it('returns true when the model value matches the pattern (case-insensitive)', () => {
        const matcher = new Matcher(strAttr, 'like', 'ELL');
        expect(matcher.evaluate(model({ name: 'hello world' }))).toBe(true);
      });

      it('returns false when the model value does not match the pattern', () => {
        const matcher = new Matcher(strAttr, 'like', 'xyz');
        expect(matcher.evaluate(model({ name: 'hello world' }))).toBe(false);
      });
    });

    describe('unknown comparator', () => {
      it('throws an error for unrecognised comparators', () => {
        const matcher = new Matcher(strAttr, 'nonexistent', 'val');
        expect(() => matcher.evaluate(model({ name: 'hello' }))).toThrow();
      });
    });

    describe('function-valued model properties', () => {
      it('calls the function and evaluates its return value', () => {
        const m = new SimpleModel({});
        (m as any).name = () => 'dynamic';
        const matcher = new Matcher(strAttr, '=', 'dynamic');
        expect(matcher.evaluate(m)).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // whereSQL()
  // ---------------------------------------------------------------------------
  describe('whereSQL()', () => {
    describe('string values', () => {
      it('wraps the value in single quotes', () => {
        const matcher = Thread.attributes.subject.equal('Newsletter');
        expect(matcher.whereSQL(Thread)).toBe("`Thread`.`subject` = 'Newsletter'");
      });

      it('escapes single quotes by doubling them', () => {
        const matcher = Thread.attributes.subject.equal("you're");
        expect(matcher.whereSQL(Thread)).toBe("`Thread`.`subject` = 'you''re'");
      });
    });

    describe('boolean values', () => {
      it('converts equal(true) to != 0', () => {
        const matcher = Thread.attributes.unread.equal(true);
        expect(matcher.whereSQL(Thread)).toBe('`Thread`.`unread` != 0');
      });

      it('converts equal(false) to = 0', () => {
        const matcher = Thread.attributes.starred.equal(false);
        expect(matcher.whereSQL(Thread)).toBe('`Thread`.`starred` = 0');
      });
    });

    describe('null values', () => {
      it('generates IS NULL for = comparator', () => {
        const matcher = new Matcher(Thread.attributes.subject, '=', null);
        expect(matcher.whereSQL(Thread)).toBe('`Thread`.`subject` IS NULL');
      });

      it('generates IS NOT NULL for != comparator', () => {
        const matcher = new Matcher(Thread.attributes.subject, '!=', null);
        expect(matcher.whereSQL(Thread)).toBe('`Thread`.`subject` IS NOT NULL');
      });
    });

    describe('numeric values', () => {
      it('uses the raw numeric value in the SQL', () => {
        const matcher = Thread.attributes.version.equal(42);
        expect(matcher.whereSQL(Thread)).toBe('`Thread`.`version` = 42');
      });
    });

    describe('Date values', () => {
      it('converts Date to Unix timestamp (seconds)', () => {
        const d = new Date(1000000 * 1000); // epoch + 1000000 seconds
        const matcher = new Matcher(Thread.attributes.lastMessageReceivedTimestamp, '=', d);
        expect(matcher.whereSQL(Thread)).toBe('`Thread`.`lastMessageReceivedTimestamp` = 1000000');
      });
    });

    describe('Array values', () => {
      it('generates an IN clause with quoted strings', () => {
        const matcher = Thread.attributes.accountId.in(['abc', 'def']);
        expect(matcher.whereSQL(Thread)).toBe("`Thread`.`accountId` in ('abc','def')");
      });

      it('escapes single quotes inside array values', () => {
        const matcher = Thread.attributes.accountId.in(["a'b", 'cd']);
        expect(matcher.whereSQL(Thread)).toBe("`Thread`.`accountId` in ('a''b','cd')");
      });

      it('throws when array contains non-string values', () => {
        // Construct directly to bypass the Attribute.in() guard
        const matcher = new Matcher(Thread.attributes.accountId, 'in', [1, 2]);
        expect(() => matcher.whereSQL(Thread)).toThrow();
      });
    });

    describe('= comparator', () => {
      it('generates an equality clause', () => {
        const matcher = Thread.attributes.subject.equal('test');
        expect(matcher.whereSQL(Thread)).toBe("`Thread`.`subject` = 'test'");
      });
    });

    describe('!= comparator', () => {
      it('generates an inequality clause', () => {
        const matcher = Thread.attributes.subject.not('test');
        expect(matcher.whereSQL(Thread)).toBe("`Thread`.`subject` != 'test'");
      });
    });

    describe('startsWith comparator', () => {
      it('generates a LIKE clause with a trailing wildcard', () => {
        const matcher = new Matcher(Thread.attributes.subject, 'startsWith', 'Hello');
        expect(matcher.whereSQL(Thread)).toBe(
          "`Thread`.`subject` LIKE 'Hello%' ESCAPE '\\'"
        );
      });

      it('escapes LIKE special characters (%, _, \\) in the prefix', () => {
        const matcher = new Matcher(Thread.attributes.subject, 'startsWith', '50% off_all\\items');
        expect(matcher.whereSQL(Thread)).toBe(
          "`Thread`.`subject` LIKE '50\\% off\\_all\\\\items%' ESCAPE '\\'"
        );
      });

      it('escapes single quotes in the prefix', () => {
        const matcher = new Matcher(Thread.attributes.subject, 'startsWith', "it's");
        expect(matcher.whereSQL(Thread)).toBe(
          "`Thread`.`subject` LIKE 'it''s%' ESCAPE '\\'"
        );
      });
    });

    describe('like comparator', () => {
      it('wraps the value in % wildcards', () => {
        const matcher = new Matcher(Thread.attributes.subject, 'like', 'news');
        expect(matcher.whereSQL(Thread)).toBe("`Thread`.`subject` like '%news%'");
      });

      it('escapes single quotes inside the pattern', () => {
        const matcher = new Matcher(Thread.attributes.subject, 'like', "you're");
        expect(matcher.whereSQL(Thread)).toBe("`Thread`.`subject` like '%you''re%'");
      });
    });

    describe('contains comparator', () => {
      it('generates a join-table value comparison', () => {
        Matcher.muid = 5;
        const matcher = Thread.attributes.categories.contains('inbox-id');
        expect(matcher.whereSQL(Thread)).toBe("`M5`.`value` = 'inbox-id'");
      });
    });

    describe('containsAny comparator', () => {
      it('generates a join-table IN clause', () => {
        Matcher.muid = 3;
        const matcher = Thread.attributes.categories.containsAny(['id-1', 'id-2']);
        expect(matcher.whereSQL(Thread)).toBe("`M3`.`value` IN ('id-1','id-2')");
      });
    });

    describe('default comparators (<, >, <=, >=)', () => {
      it('passes the comparator symbol through verbatim', () => {
        const matcher = new Matcher(Thread.attributes.version, '>', 5);
        expect(matcher.whereSQL(Thread)).toBe('`Thread`.`version` > 5');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // joinSQL()
  // ---------------------------------------------------------------------------
  describe('joinSQL()', () => {
    it('returns false for non-collection comparators', () => {
      const matcher = Thread.attributes.subject.equal('test');
      expect(matcher.joinSQL(Thread)).toBe(false);
    });

    it('returns an INNER JOIN clause for contains', () => {
      Matcher.muid = 1;
      const matcher = Thread.attributes.categories.contains('cat-id');
      expect(matcher.joinSQL(Thread)).toBe(
        'INNER JOIN `ThreadCategory` AS `M1` ON `M1`.`id` = `Thread`.`id`'
      );
    });

    it('returns an INNER JOIN clause for containsAny', () => {
      Matcher.muid = 2;
      const matcher = Thread.attributes.categories.containsAny(['cat-a', 'cat-b']);
      expect(matcher.joinSQL(Thread)).toBe(
        'INNER JOIN `ThreadCategory` AS `M2` ON `M2`.`id` = `Thread`.`id`'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // muid assignment
  // ---------------------------------------------------------------------------
  describe('muid', () => {
    it('increments with each new Matcher instance', () => {
      Matcher.muid = 0;
      const m1 = new Matcher(strAttr, '=', 'a');
      const m2 = new Matcher(strAttr, '=', 'b');
      expect(m1.muid).toBe(0);
      expect(m2.muid).toBe(1);
    });

    it('wraps around after 49', () => {
      Matcher.muid = 49;
      const m = new Matcher(strAttr, '=', 'a');
      expect(m.muid).toBe(49);
      expect(Matcher.muid).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // OrCompositeMatcher
  // ---------------------------------------------------------------------------
  describe('OrCompositeMatcher', () => {
    it('evaluate() returns true when at least one child matches', () => {
      const trueMatcher = new Matcher(strAttr, '=', 'hello');
      const falseMatcher = new Matcher(strAttr, '=', 'nope');
      const orMatcher = new OrCompositeMatcher([falseMatcher, trueMatcher]);
      expect(orMatcher.evaluate(model({ name: 'hello' }))).toBe(true);
    });

    it('evaluate() returns false when no children match', () => {
      const falseMatcher1 = new Matcher(strAttr, '=', 'nope');
      const falseMatcher2 = new Matcher(strAttr, '=', 'also-nope');
      const orMatcher = new OrCompositeMatcher([falseMatcher1, falseMatcher2]);
      expect(orMatcher.evaluate(model({ name: 'hello' }))).toBe(false);
    });

    it('evaluate() returns true when all children match', () => {
      const trueMatcher1 = new Matcher(strAttr, '=', 'hello');
      const trueMatcher2 = new Matcher(strAttr, '!=', 'world');
      const orMatcher = new OrCompositeMatcher([trueMatcher1, trueMatcher2]);
      expect(orMatcher.evaluate(model({ name: 'hello' }))).toBe(true);
    });

    it('whereSQL() joins child clauses with OR', () => {
      const m1 = Thread.attributes.subject.equal('A');
      const m2 = Thread.attributes.subject.equal('B');
      const orMatcher = new OrCompositeMatcher([m1, m2]);
      expect(orMatcher.whereSQL(Thread)).toBe(
        "(`Thread`.`subject` = 'A' OR `Thread`.`subject` = 'B')"
      );
    });

    it('whereSQL() wraps a single child in parentheses', () => {
      const m1 = Thread.attributes.unread.equal(true);
      const orMatcher = new OrCompositeMatcher([m1]);
      expect(orMatcher.whereSQL(Thread)).toBe('(`Thread`.`unread` != 0)');
    });
  });

  // ---------------------------------------------------------------------------
  // AndCompositeMatcher
  // ---------------------------------------------------------------------------
  describe('AndCompositeMatcher', () => {
    it('evaluate() returns true only when all children match', () => {
      const trueMatcher = new Matcher(strAttr, '=', 'hello');
      const trueMatcher2 = new Matcher(numAttr, '>', 0);
      const andMatcher = new AndCompositeMatcher([trueMatcher, trueMatcher2]);
      expect(andMatcher.evaluate(model({ name: 'hello', count: 5 }))).toBe(true);
    });

    it('evaluate() returns false when any child does not match', () => {
      const trueMatcher = new Matcher(strAttr, '=', 'hello');
      const falseMatcher = new Matcher(numAttr, '>', 100);
      const andMatcher = new AndCompositeMatcher([trueMatcher, falseMatcher]);
      expect(andMatcher.evaluate(model({ name: 'hello', count: 5 }))).toBe(false);
    });

    it('evaluate() returns false when no children match', () => {
      const falseMatcher1 = new Matcher(strAttr, '=', 'nope');
      const falseMatcher2 = new Matcher(numAttr, '>', 100);
      const andMatcher = new AndCompositeMatcher([falseMatcher1, falseMatcher2]);
      expect(andMatcher.evaluate(model({ name: 'hello', count: 5 }))).toBe(false);
    });

    it('whereSQL() joins child clauses with AND', () => {
      const m1 = Thread.attributes.unread.equal(true);
      const m2 = Thread.attributes.subject.equal('Newsletter');
      const andMatcher = new AndCompositeMatcher([m1, m2]);
      expect(andMatcher.whereSQL(Thread)).toBe(
        "(`Thread`.`unread` != 0 AND `Thread`.`subject` = 'Newsletter')"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // NotCompositeMatcher (accessed via Matcher.Not)
  // ---------------------------------------------------------------------------
  describe('NotCompositeMatcher', () => {
    it('whereSQL() wraps the AND clause with NOT', () => {
      const NotMatcher = Matcher.Not;
      const m1 = Thread.attributes.unread.equal(true);
      const m2 = Thread.attributes.starred.equal(true);
      const notMatcher = new NotMatcher([m1, m2]);
      expect(notMatcher.whereSQL(Thread)).toBe(
        'NOT ((`Thread`.`unread` != 0 AND `Thread`.`starred` != 0))'
      );
    });

    it('whereSQL() wraps a single clause with NOT', () => {
      const NotMatcher = Matcher.Not;
      const m1 = Thread.attributes.unread.equal(true);
      const notMatcher = new NotMatcher([m1]);
      expect(notMatcher.whereSQL(Thread)).toBe('NOT ((`Thread`.`unread` != 0))');
    });
  });

  // ---------------------------------------------------------------------------
  // SearchMatcher (accessed via Matcher.Search)
  // ---------------------------------------------------------------------------
  describe('SearchMatcher', () => {
    it('throws when constructed without a string', () => {
      const SearchMatcher = Matcher.Search;
      expect(() => new SearchMatcher(null as any)).toThrow();
      expect(() => new SearchMatcher('' as any)).toThrow();
      expect(() => new SearchMatcher(42 as any)).toThrow();
    });

    it('generates a full-text search SQL clause', () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher('hello');
      expect(matcher.whereSQL(Thread)).toBe(
        '`Thread`.`id` IN (SELECT `content_id` FROM `ThreadSearch` WHERE `ThreadSearch` MATCH \'"hello"*\' LIMIT 1000)'
      );
    });

    it('trims leading and trailing whitespace from the query', () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher('  hello  ');
      expect(matcher.searchQuery).toBe('hello');
    });

    it('strips a leading single quote', () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher("'hello");
      expect(matcher.searchQuery).toBe('hello');
    });

    it('strips a trailing single quote', () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher("hello'");
      expect(matcher.searchQuery).toBe('hello');
    });

    it('strips surrounding double quotes', () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher('"hello"');
      expect(matcher.searchQuery).toBe('hello');
    });

    it("escapes internal single quotes as ''", () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher("it's a test");
      expect(matcher.searchQuery).toBe("it''s a test");
    });

    it('escapes internal double quotes as ""', () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher('say "hello"');
      // Pipeline on 'say "hello"':
      //   trim        => 'say "hello"'
      //   strip lead  => 'say "hello"'  (leading char is 's')
      //   strip trail => 'say "hello'   (trailing '"' stripped)
      //   escape '    => 'say "hello'   (no single quotes)
      //   escape "    => 'say ""hello'  (one " becomes "")
      expect(matcher.searchQuery).toBe('say ""hello');
    });

    it('evaluate() always returns true', () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher('anything');
      expect(matcher.evaluate()).toBe(true);
    });

    it('exposes the processed search query via searchQuery', () => {
      const SearchMatcher = Matcher.Search;
      const matcher = new SearchMatcher('newsletter');
      expect(matcher.searchQuery).toBe('newsletter');
    });
  });

  // ---------------------------------------------------------------------------
  // Static accessors
  // ---------------------------------------------------------------------------
  describe('static class accessors', () => {
    it('Matcher.Or returns OrCompositeMatcher', () => {
      expect(Matcher.Or).toBe(OrCompositeMatcher);
    });

    it('Matcher.And returns AndCompositeMatcher', () => {
      expect(Matcher.And).toBe(AndCompositeMatcher);
    });

    it('Matcher.Not returns NotCompositeMatcher class', () => {
      expect(typeof Matcher.Not).toBe('function');
    });

    it('Matcher.Search returns SearchMatcher class', () => {
      expect(typeof Matcher.Search).toBe('function');
    });
  });
});
