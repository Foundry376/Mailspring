import { DatabaseStore, SearchQueryAST } from 'mailspring-exports';

export type Highlighted = { text: string; match: boolean }[];
export type Highlighter = (text: string) => Highlighted | null;

export type SearchHighlighter = {
  subject: Highlighter;
  participants: Highlighter;
  // For each thread whose indexed body matches, the words around the match.
  excerpts: (threadIds: string[]) => Promise<{ [threadId: string]: Highlighted }>;
};

// Index of the `body` column in the engine's ThreadSearch FTS5 table
// (content_id, subject, to_, from_, categories, body).
const BODY_COLUMN = 5;
// Long enough that words follow the match once those before it are cut; the row's
// ellipsis trims what doesn't fit.
const EXCERPT_TOKENS = 32;
// A thread list row shows one line of the excerpt, so the words before the first match
// are cut to this many, or the match can fall past the row's ellipsis.
const WORDS_BEFORE_MATCH = 4;

type QueryExpression = InstanceType<typeof SearchQueryAST.QueryExpression>;

// The text terms of a query, by the field they search: free text matches any column,
// including the body. Terms under the right side of a NOT are what the results must not
// contain, so they are left out.
function textTerms(
  node: QueryExpression,
  negated = false,
  out = { free: [] as string[], subject: [] as string[], people: [] as string[] }
) {
  const {
    AndQueryExpression,
    OrQueryExpression,
    NotQueryExpression,
    GenericQueryExpression,
    SubjectQueryExpression,
    FromQueryExpression,
    ToQueryExpression,
  } = SearchQueryAST;
  if (node instanceof NotQueryExpression) {
    textTerms(node.e1, negated, out);
    textTerms(node.e2, !negated, out);
  } else if (node instanceof AndQueryExpression || node instanceof OrQueryExpression) {
    textTerms(node.e1, negated, out);
    textTerms(node.e2, negated, out);
  } else if (negated) {
    return out;
  } else if (node instanceof GenericQueryExpression) {
    out.free.push(node.text.token.s);
  } else if (node instanceof SubjectQueryExpression) {
    out.subject.push(node.text.token.s);
  } else if (node instanceof FromQueryExpression || node instanceof ToQueryExpression) {
    out.people.push(node.text.token.s);
  }
  return out;
}

// One entry per code point, case and diacritics removed as the unicode61 tokenizer removes
// them, so a term and a word compare position by position.
function foldedChars(s: string): string[] {
  return [...s].map((ch) => ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
}

function pushPart(parts: Highlighted, text: string, match: boolean) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.match === match) {
    last.text += text;
  } else {
    parts.push({ text, match });
  }
}

// Marks the part of each word that a term spells from its start, as a prefix search
// matches it: "wall" marks "Wall" in "Wallpaper". The words of a phrase are matched
// one by one. Returns null when nothing in the text matches.
export function termHighlighter(terms: string[]): Highlighter {
  const termChars = [...new Set(terms.flatMap((term) => term.split(/\s+/)).filter(Boolean))]
    .map(foldedChars)
    .sort((a, b) => b.length - a.length);

  return (text: string) => {
    const parts: Highlighted = [];
    let last = 0;
    for (const { 0: word, index } of text.matchAll(/[\p{L}\p{N}]+/gu)) {
      const wordChars = foldedChars(word);
      const term = termChars.find((chars) => chars.every((ch, i) => ch === wordChars[i]));
      if (!term) continue;
      const prefix = [...word].slice(0, term.length).join('');
      pushPart(parts, text.slice(last, index), false);
      pushPart(parts, prefix, true);
      last = index + prefix.length;
    }
    if (parts.length === 0) {
      return null;
    }
    pushPart(parts, text.slice(last), false);
    return parts;
  };
}

function cutLeadingContext(parts: Highlighted): Highlighted {
  const first = parts[0];
  if (first.match) return parts;
  const tail = first.text.match(new RegExp(`(?:\\S+\\s+){0,${WORDS_BEFORE_MATCH}}\\S*$`))[0];
  if (tail.length === first.text.length) return parts;
  return [{ text: `…${tail}`, match: false }, ...parts.slice(1)];
}

// FTS5's snippet() picks the window of the body around the best match. The window's words
// are then marked by the same highlighter as subjects, so a word found only through Porter
// stemming ("runs" for "running") is not marked, and its thread keeps the plain snippet.
async function loadExcerpts(
  matchExpression: string,
  highlight: Highlighter,
  threadIds: string[]
): Promise<{ [threadId: string]: Highlighted }> {
  const placeholders = threadIds.map(() => '?').join(',');
  const rows = await DatabaseStore._query(
    `SELECT \`content_id\` AS id, snippet(\`ThreadSearch\`, ${BODY_COLUMN}, '', '', '…', ${EXCERPT_TOKENS}) AS excerpt ` +
      `FROM \`ThreadSearch\` WHERE \`ThreadSearch\` MATCH ? AND \`content_id\` IN (${placeholders})`,
    [matchExpression, ...threadIds],
    true
  );
  const excerpts = {};
  for (const { id, excerpt } of rows) {
    const parts = highlight((excerpt || '').trim());
    if (parts) {
      excerpts[id] = cutLeadingContext(parts);
    }
  }
  return excerpts;
}

// Highlights a query's text terms in search results: free text in subjects, participants
// and bodies, and subject:, from: and to: terms in their own field. The body is matched
// with the FTS5 phrasing LocalSearchQueryBackend uses, so excerpts come from the threads
// the search found.
export function searchHighlighter(parsedQuery: QueryExpression | null): SearchHighlighter | null {
  if (!parsedQuery) {
    return null;
  }
  const { free, subject, people } = textTerms(parsedQuery);
  if (free.length + subject.length + people.length === 0) {
    return null;
  }
  const phrases = free.map((term) => `"${term.replace(/"/g, '""')}"*`);
  const matchExpression = `body : (${phrases.join(' OR ')})`;
  const body = termHighlighter(free);

  return {
    subject: termHighlighter([...free, ...subject]),
    participants: termHighlighter([...free, ...people]),
    excerpts: (threadIds) =>
      phrases.length && threadIds.length
        ? loadExcerpts(matchExpression, body, threadIds)
        : Promise.resolve({}),
  };
}
