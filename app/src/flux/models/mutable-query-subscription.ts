import { QuerySubscription } from './query-subscription';
import { Model } from './model';

export class MutableQuerySubscription<T extends Model> extends QuerySubscription<T> {
  replaceQuery(nextQuery) {
    if (this._query && this._query.sql() === nextQuery.sql()) {
      return;
    }

    let rangeIsOnlyChange = false;
    if (this._query) {
      rangeIsOnlyChange =
        this._query
          .clone()
          .offset(0)
          .limit(0)
          .sql() ===
        nextQuery
          .clone()
          .offset(0)
          .limit(0)
          .sql();
    }

    this.cancelPendingUpdate();

    nextQuery.finalize();
    this._query = nextQuery;
    if (!(this._set && rangeIsOnlyChange)) {
      this._set = null;
    }
    this.update();
  }

  replaceRange = ({ start, end }) => {
    if (!this._query) {
      return;
    }

    const next = this._query.clone().page(start, end);
    if (!next.range().isEqual(this._query.range())) {
      this.replaceQuery(next);
    }
  };
}
