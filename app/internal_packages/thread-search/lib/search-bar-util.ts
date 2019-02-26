import {
  localized,
  CategoryStore,
  DatabaseStore,
  SearchQueryParser,
  Thread,
  ContactStore,
} from 'mailspring-exports';
import _ from 'underscore';

// start of string or preceding whitespace
// a known token
// one of:
// - whitespace
// - end of string
// - a colon, optional space, and optional word
export const TokenAndTermRegexp = () =>
  /(^|\s)(i[ns]?|s[iu]?[nb]?[cj]?e?c?t?|fr?o?m?|to?|ha?s?|be?f?o?r?e?|af?t?e?r?)(?::? ?$|: ?("[^"]*"?|[^\s]+))/gi;

export const LearnMoreURL =
  'https://foundry376.zendesk.com/hc/en-us/articles/115002212931-Search-with-advanced-Gmail-style-queries';

export const rankOfRole = role => {
  const rank = ['inbox', 'important', 'snoozed', 'sent', 'all', 'spam', 'trash'].indexOf(role);
  return rank !== -1 ? 20 - rank : -1000;
};

export const wrapInQuotes = s => `"${s.replace(/"/g, '')}"`;

export const getThreadSuggestions = async (term, accountIds) => {
  let dbQuery = DatabaseStore.findAll(Thread)
    .structuredSearch(SearchQueryParser.parse(`subject:${wrapInQuotes(term)}`))
    .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
    .limit(10);

  if (Array.isArray(accountIds) && accountIds.length === 1) {
    dbQuery = dbQuery.where({ accountId: accountIds[0] });
  }

  return dbQuery.background().then(results => results);
};

export const getContactSuggestions = async (term, accountIds) => {
  const results = [];
  const contacts = term
    ? await ContactStore.searchContacts(term, { limit: 5 })
    : await ContactStore.topContacts({ limit: 5 });

  contacts.forEach(c => results.push(c.email, c.name));

  return _.uniq(results).filter(r => r.toLowerCase().startsWith(term));
};

export const getCategorySuggestions = async (term, accountIds) =>
  _.uniq(
    CategoryStore.categories()
      .filter(c => accountIds.includes(c.accountId))
      .sort((a, b) => rankOfRole(b.role) - rankOfRole(a.role))
      .map(c => c.displayName)
  )
    .filter(s => s.toLowerCase().startsWith(term))
    .slice(0, 8);

export const TokenSuggestions = [
  {
    token: 'from',
    term: '',
    description: localized('an email address'),
    termSuggestions: getContactSuggestions,
  },
  {
    token: 'to',
    term: '',
    description: localized('an email address'),
    termSuggestions: getContactSuggestions,
  },
  {
    token: 'in',
    term: '',
    description: localized('folder or label'),
    termSuggestions: getCategorySuggestions,
  },
  {
    token: 'before',
    term: '',
    description: localized('date received or range'),
    termSuggestions: ['yesterday', '2 days ago', 'last week', 'last month', '>=2018/05/31'],
  },
  {
    token: 'since',
    term: '',
    description: localized('date received or range'),
    termSuggestions: ['yesterday', '2 days ago', 'last week', 'last month', '>=2018/05/31'],
  },
  {
    token: 'after',
    hidden: true,
    term: '',
    description: localized('date received or range'),
    termSuggestions: ['yesterday', '2 days ago', 'last week', 'last month', '>=2018/05/31'],
  },
  {
    token: 'is',
    term: '',
    description: 'unread, starred',
    termSuggestions: ['unread', 'starred'],
  },
  {
    token: 'has',
    term: '',
    description: 'attachment',
    termSuggestions: ['attachment'],
  },
  {
    token: 'subject',
    term: '',
    description: localized('an email subject'),
    termSuggestions: [],
  },
  // {
  //   token: 'has',
  //   term: '',
  //   description: 'attachment',
  //   termSuggestions: ['attachment'],
  // },
];

export const TokenSuggestionsForEmpty = TokenSuggestions.filter(t => !t.hidden);

export function getCurrentTokenAndTerm(query, insertionIndex) {
  const regexp = TokenAndTermRegexp();
  const queryWithSpaces = query.replace(/\s/g, ' ');

  let next = null;
  while ((next = regexp.exec(queryWithSpaces))) {
    if (next.index <= insertionIndex && next.index + next[0].length >= insertionIndex) {
      return {
        token: next[2],
        term: (next[3] || '')
          .replace(/"$/, '')
          .replace(/^"/, '')
          .toLowerCase(),
        index: next.index,
        length: next[0].length,
      };
    }
  }
  return { token: null, term: null, index: -1, length: 0 };
}
