import React from 'react';
import * as Utils from '../flux/models/utils';

export default function BoldedSearchResult({
  query = '',
  value = '',
}: { query?: string; value?: string } = {}) {
  const searchTerm = (query || '').trim();

  if (searchTerm.length === 0) return <span>{value}</span>;

  const splitRe = Utils.wordSearchRegExp(searchTerm);
  // Use a non-global copy for .test() so lastIndex doesn't persist between parts
  const testRe = new RegExp(splitRe.source, splitRe.flags.replace('g', ''));
  const parts = value.split(splitRe).map((part, idx) => {
    // The wordSearchRegExp looks for a leading non-word character to
    // deterine if it's a valid place to search. As such, we need to not
    // include that leading character as part of our match.
    if (testRe.test(part)) {
      if (/\W/.test(part[0])) {
        return (
          <span key={idx}>
            {part[0]}
            <strong>{part.slice(1)}</strong>
          </span>
        );
      }
      return <strong key={idx}>{part}</strong>;
    }
    return part;
  });
  return <span className="search-result">{parts}</span>;
}
