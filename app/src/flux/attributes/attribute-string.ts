import { Attribute } from './attribute';
import { Matcher } from './matcher';

/*
Public: The value of this attribute is always a string or `null`.

String attributes can be queries using `equal`, `not`, and `startsWith`. Matching on
`greaterThan` and `lessThan` is not supported.

Section: Database
*/
export class AttributeString extends Attribute {
  // `null` is omitted rather than serialized, so that null and absent mean the same
  // thing to mailsync. The engine guards optional string fields with nlohmann
  // `count()`, which reports a key as present when its value is `null`, and then
  // reads it with `get<string>()` - so `"key": null` slips past the guard and throws
  // `json::type_error`. Draft JSON is even more sensitive: `inflateClientDraftJSON`
  // fills in defaults with nlohmann's object `insert`, which does not overwrite keys
  // that are already present, so a null would survive into an unguarded read.
  // Foundry376/Mailspring-Sync#143 keeps such a task from killing the engine.
  toJSON(val: string | null): string | undefined {
    return val === null ? undefined : val;
  }

  fromJSON(val) {
    return val === null || val === undefined || val === false ? null : `${val}`;
  }

  // Public: Returns a {Matcher} for objects starting with the provided value.
  startsWith(val) {
    return new Matcher(this, 'startsWith', val);
  }

  columnSQL() {
    return `${this.tableColumn} TEXT`;
  }

  like(val) {
    this._assertPresentAndQueryable('like', val);
    return new Matcher(this, 'like', val);
  }

  lessThan(val) {
    this._assertPresentAndQueryable('lessThanOrEqualTo', val);
    return new Matcher(this, '<', val);
  }

  lessThanOrEqualTo(val) {
    this._assertPresentAndQueryable('lessThanOrEqualTo', val);
    return new Matcher(this, '<=', val);
  }

  greaterThan(val) {
    this._assertPresentAndQueryable('greaterThanOrEqualTo', val);
    return new Matcher(this, '>', val);
  }

  greaterThanOrEqualTo(val) {
    this._assertPresentAndQueryable('greaterThanOrEqualTo', val);
    return new Matcher(this, '>=', val);
  }
}
