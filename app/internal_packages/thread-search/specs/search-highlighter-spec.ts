import { DatabaseStore, SearchQueryParser } from 'mailspring-exports';
import { searchHighlighter, termHighlighter } from '../lib/search-highlighter';

const highlighterFor = (query: string) => searchHighlighter(SearchQueryParser.parse(query));

describe('termHighlighter', function () {
  it('marks the typed prefix of each word that starts with a term', function () {
    expect(termHighlighter(['wall'])('New Wallpaper for the wall')).toEqual([
      { text: 'New ', match: false },
      { text: 'Wall', match: true },
      { text: 'paper for the ', match: false },
      { text: 'wall', match: true },
    ]);
  });

  it('matches at word starts only, ignoring case and accents', function () {
    expect(termHighlighter(['invoice', 'cafe'])('Reinvoice the Cafétaria')).toEqual([
      { text: 'Reinvoice the ', match: false },
      { text: 'Café', match: true },
      { text: 'taria', match: false },
    ]);
  });

  it('prefers the longest term that spells the word', function () {
    expect(termHighlighter(['in', 'invoice'])('invoices')).toEqual([
      { text: 'invoice', match: true },
      { text: 's', match: false },
    ]);
  });

  it('matches the words of a phrase one by one', function () {
    expect(termHighlighter(['paid the invoice'])('paid the invoices')).toEqual([
      { text: 'paid', match: true },
      { text: ' ', match: false },
      { text: 'the', match: true },
      { text: ' ', match: false },
      { text: 'invoice', match: true },
      { text: 's', match: false },
    ]);
  });

  it('is null when no word matches, or there are no terms', function () {
    expect(termHighlighter(['invoice'])('Lunch on Friday?')).toBe(null);
    expect(termHighlighter([])('Lunch on Friday?')).toBe(null);
  });
});

describe('searchHighlighter', function () {
  it('is null for a query without text terms', function () {
    expect(highlighterFor('is:unread')).toBe(null);
    expect(searchHighlighter(null)).toBe(null);
  });

  it('highlights free text in every field, and field terms in their own field', function () {
    const h = highlighterFor('from:priya subject:launch invoice');
    expect(h.subject('Launch invoice for Priya')).toEqual([
      { text: 'Launch', match: true },
      { text: ' ', match: false },
      { text: 'invoice', match: true },
      { text: ' for Priya', match: false },
    ]);
    expect(h.participants('Priya Shah')[0]).toEqual({ text: 'Priya', match: true });
    expect(h.participants('Launch Team')).toBe(null);
  });

  it('leaves out the terms a NOT excludes', function () {
    const h = highlighterFor('(invoice) NOT (draft OR in:trash)');
    expect(h.subject('Draft')).toBe(null);
    expect(h.subject('Invoice')).not.toBe(null);
  });

  describe('excerpts', function () {
    it('queries the body with the free-text terms, as local search phrases them', async function () {
      await highlighterFor('from:ana invoice say"hi').excerpts(['t1', 't2']);
      const [sql, values] = (DatabaseStore._query as jasmine.Spy).calls[0].args;
      expect(sql).toContain('`content_id` IN (?,?)');
      expect(values).toEqual(['body : ("invoice"* OR "say""hi"*)', 't1', 't2']);
    });

    it('marks matches, and keeps only the last few words before the first one', async function () {
      (DatabaseStore._query as jasmine.Spy).andCallFake(() =>
        Promise.resolve([
          {
            id: 't1',
            excerpt: ' Finance needs the confirmation before they reimburse the costs I invoiced…',
          },
          { id: 't2', excerpt: 'Ten invoicing tips' },
        ])
      );
      const excerpts = await highlighterFor('invoice').excerpts(['t1', 't2']);
      expect(excerpts.t1).toEqual([
        { text: '…reimburse the costs I ', match: false },
        { text: 'invoice', match: true },
        { text: 'd…', match: false },
      ]);
      // A body found only through stemming has no word to mark, and keeps its snippet
      expect(excerpts.t2).toBeUndefined();
    });

    it('does not query without free text or threads', async function () {
      expect(await highlighterFor('from:ana').excerpts(['t1'])).toEqual({});
      expect(await highlighterFor('invoice').excerpts([])).toEqual({});
      expect(DatabaseStore._query).not.toHaveBeenCalled();
    });
  });
});
