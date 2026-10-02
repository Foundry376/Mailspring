import { SearchQueryAST, SearchQueryParser } from 'mailspring-exports';

const {
  SearchQueryToken,
  OrQueryExpression,
  AndQueryExpression,
  FromQueryExpression,
  ToQueryExpression,
  SubjectQueryExpression,
  GenericQueryExpression,
  TextQueryExpression,
  UnreadStatusQueryExpression,
  StarredStatusQueryExpression,
  InQueryExpression,
  HasAttachmentQueryExpression,
} = SearchQueryAST;

const token = (text) => {
  return new SearchQueryToken(text);
};
const and = (e1, e2) => {
  return new AndQueryExpression(e1, e2);
};
const or = (e1, e2) => {
  return new OrQueryExpression(e1, e2);
};
const from = (text) => {
  return new FromQueryExpression(text);
};
const to = (text) => {
  return new ToQueryExpression(text);
};
const subject = (text) => {
  return new SubjectQueryExpression(text);
};
const generic = (text) => {
  return new GenericQueryExpression(text);
};
const in_ = (text) => {
  return new InQueryExpression(text);
};
const text = (tok) => {
  return new TextQueryExpression(tok);
};
const unread = (status) => {
  return new UnreadStatusQueryExpression(status);
};
const starred = (status) => {
  return new StarredStatusQueryExpression(status);
};
const has = () => {
  return new HasAttachmentQueryExpression();
};

describe('SearchQueryParser.parse', () => {
  it('correctly parses simple queries', () => {
    expect(SearchQueryParser.parse('blah').equals(generic(text(token('blah'))))).toBe(true);
    expect(SearchQueryParser.parse('"foo bar"').equals(generic(text(token('foo bar'))))).toBe(true);
    expect(SearchQueryParser.parse('to:blah').equals(to(text(token('blah'))))).toBe(true);
    expect(SearchQueryParser.parse('from:blah').equals(from(text(token('blah'))))).toBe(true);
    expect(SearchQueryParser.parse('subject:blah').equals(subject(text(token('blah'))))).toBe(true);
    expect(
      SearchQueryParser.parse('to:mhahnenb@gmail.com').equals(to(text(token('mhahnenb@gmail.com'))))
    ).toBe(true);
    expect(
      SearchQueryParser.parse('to:"mhahnenb@gmail.com"').equals(
        to(text(token('mhahnenb@gmail.com')))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('to:"Mark mhahnenb@gmail.com"').equals(
        to(text(token('Mark mhahnenb@gmail.com')))
      )
    ).toBe(true);
    expect(SearchQueryParser.parse('is:unread').equals(unread(true))).toBe(true);
    expect(SearchQueryParser.parse('is:read').equals(unread(false))).toBe(true);
    expect(SearchQueryParser.parse('is:starred').equals(starred(true))).toBe(true);
    expect(SearchQueryParser.parse('is:unstarred').equals(starred(false))).toBe(true);
    expect(SearchQueryParser.parse('in:foo').equals(in_(text(token('foo'))))).toBe(true);
    expect(SearchQueryParser.parse('has:attachment').equals(has())).toBe(true);
  });

  it('correctly parses reserved words as normal text in certain places', () => {
    expect(SearchQueryParser.parse('to:blah').equals(to(text(token('blah'))))).toBe(true);
    expect(SearchQueryParser.parse('to:to').equals(to(text(token('to'))))).toBe(true);
    expect(SearchQueryParser.parse('to:subject').equals(to(text(token('subject'))))).toBe(true);
    expect(SearchQueryParser.parse('to:from').equals(to(text(token('from'))))).toBe(true);
    expect(SearchQueryParser.parse('to:unread').equals(to(text(token('unread'))))).toBe(true);
    expect(SearchQueryParser.parse('to:starred').equals(to(text(token('starred'))))).toBe(true);
  });

  it('correctly parses compound queries', () => {
    expect(
      SearchQueryParser.parse('foo bar').equals(
        and(generic(text(token('foo'))), generic(text(token('bar'))))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('foo AND bar').equals(
        and(generic(text(token('foo'))), generic(text(token('bar'))))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('foo OR bar').equals(
        or(generic(text(token('foo'))), generic(text(token('bar'))))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('to:foo OR bar').equals(
        or(to(text(token('foo'))), generic(text(token('bar'))))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('foo OR to:bar').equals(
        or(generic(text(token('foo'))), to(text(token('bar'))))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('foo bar baz').equals(
        and(
          generic(text(token('foo'))),
          and(generic(text(token('bar'))), generic(text(token('baz'))))
        )
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('foo AND bar AND baz').equals(
        and(
          generic(text(token('foo'))),
          and(generic(text(token('bar'))), generic(text(token('baz'))))
        )
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('foo OR bar AND baz').equals(
        and(
          or(generic(text(token('foo'))), generic(text(token('bar')))),
          generic(text(token('baz')))
        )
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('foo OR bar OR baz').equals(
        or(
          generic(text(token('foo'))),
          or(generic(text(token('bar'))), generic(text(token('baz'))))
        )
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('foo is:unread').equals(
        and(generic(text(token('foo'))), unread(true))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('is:unread foo').equals(
        and(unread(true), generic(text(token('foo'))))
      )
    ).toBe(true);
  });

  it('applies a field to every term of a group', () => {
    expect(
      SearchQueryParser.parse('subject:(invoice OR payment)').equals(
        or(subject(text(token('invoice'))), subject(text(token('payment'))))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('from:(a.com OR b.com OR c.com)').equals(
        or(from(text(token('a.com'))), or(from(text(token('b.com'))), from(text(token('c.com')))))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('to:(alice bob)').equals(
        and(to(text(token('alice'))), to(text(token('bob'))))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('in:(inbox OR archive) is:unread').equals(
        and(or(in_(text(token('inbox'))), in_(text(token('archive')))), unread(true))
      )
    ).toBe(true);
    expect(
      SearchQueryParser.parse('subject:("weekly report" OR (draft AND final))').equals(
        or(
          subject(text(token('weekly report'))),
          and(subject(text(token('draft'))), subject(text(token('final'))))
        )
      )
    ).toBe(true);
  });

  it('rejects unterminated or empty field groups instead of matching "("', () => {
    expect(() => SearchQueryParser.parse('subject:(invoice OR payment')).toThrow();
    expect(() => SearchQueryParser.parse('subject:()')).toThrow();
    expect(() => SearchQueryParser.parse('subject:(OR x)')).toThrow();
  });
});
