import React from 'react';
import { openThread } from './helpers';

// A deliberately small markdown renderer for model output. It builds React
// elements (never innerHTML), so text that originated in an email can't
// inject markup. Supported: headings, bullet/numbered lists, paragraphs,
// **bold**, *italic*, `code`, and links. Only sift://thread/ links are
// clickable; other URLs render as plain text so the assistant can't be used
// to put a phishing link one click away.

// Bold, `code`, links and italics. Link labels may contain one level of
// brackets, as in [Re: [lumen/api] Fix #12](sift://thread/...).
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[(?:[^[\]]|\[[^\]]*\])+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g;

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={key}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[((?:[^[\]]|\[[^\]]*\])+)\]\(([^)\s]+)\)$/);
    if (link) {
      const [, label, href] = link;
      const threadId = href.match(/^sift:\/\/thread\/(.+)$/)?.[1];
      if (threadId) {
        return (
          <a
            key={key}
            className="sift-thread-link"
            onClick={() => openThread(decodeURIComponent(threadId))}
          >
            {label}
          </a>
        );
      }
      return <span key={key}>{label}</span>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={key}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length)
      blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => (
      <li key={i}>{inline(item, `l${blocks.length}-${i}`)}</li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`l${blocks.length}`}>{items}</ol>
      ) : (
        <ul key={`l${blocks.length}`}>{items}</ul>
      )
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const Tag = heading[1].length <= 2 ? 'h3' : 'h4';
      blocks.push(<Tag key={`h${blocks.length}`}>{inline(heading[2], `h${blocks.length}`)}</Tag>);
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet || numbered)?.[1] ?? '');
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="sift-markdown">{blocks}</div>;
}
