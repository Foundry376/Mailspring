import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { chatStream, OpenRouterError } from '../lib/ai/openrouter';
import { textToComposerHtml } from '../lib/ai/draft';
import { splitDraftBody } from '../lib/mail/composer';
import { Markdown } from '../lib/ui/markdown';

// An SSE response delivered in small, arbitrary chunks, so the parser has to
// buffer partial lines the way it does with a real network stream.
function sseResponse(lines: string[]) {
  const bytes = new TextEncoder().encode(lines.join('\n\n') + '\n\n');
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const chunk = (delta: object, extra: object = {}) =>
  `data: ${JSON.stringify({ model: 'test/model', choices: [{ index: 0, delta }], ...extra })}`;

describe('Sift', function siftSpec() {
  describe('chatStream', () => {
    it('streams text deltas and assembles tool calls from fragments', () => {
      spyOn(window, 'fetch').andReturn(
        Promise.resolve(
          sseResponse([
            ': OPENROUTER PROCESSING',
            chunk({ content: 'Let me ' }),
            chunk({ content: 'check.' }),
            chunk({
              tool_calls: [
                { index: 0, id: 'call_1', function: { name: 'search_', arguments: '{"que' } },
              ],
            }),
            chunk({
              tool_calls: [{ index: 0, function: { name: 'mail', arguments: 'ry":"launch"}' } }],
            }),
            `data: ${JSON.stringify({
              choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
              usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 },
            })}`,
            'data: [DONE]',
          ])
        )
      );
      waitsForPromise(async () => {
        const deltas: string[] = [];
        const result = await chatStream(
          'key',
          { model: 'test/model', messages: [] },
          { onText: (d) => deltas.push(d) }
        );
        expect(deltas).toEqual(['Let me ', 'check.']);
        expect(result.message.content).toBe('Let me check.');
        expect(result.message.tool_calls).toEqual([
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'search_mail', arguments: '{"query":"launch"}' },
          },
        ]);
        expect(result.finishReason).toBe('tool_calls');
        expect(result.usage.cost).toBe(0.0001);
      });
    });

    it('raises errors that OpenRouter sends mid-stream', () => {
      spyOn(window, 'fetch').andReturn(
        Promise.resolve(
          sseResponse([
            chunk({ content: 'Hi' }),
            `data: ${JSON.stringify({ error: { message: 'Provider overloaded', code: 502 } })}`,
          ])
        )
      );
      waitsForPromise(async () => {
        let error: unknown = null;
        try {
          await chatStream('key', { model: 'test/model', messages: [] });
        } catch (err) {
          error = err;
        }
        expect(error instanceof OpenRouterError).toBe(true);
        expect((error as Error).message).toBe('Provider overloaded');
      });
    });
  });

  describe('textToComposerHtml', () => {
    it('escapes markup and keeps blank lines as empty divs', () => {
      expect(textToComposerHtml('Hi <b>Sam</b>,\n\nSee you & bye')).toBe(
        '<div>Hi &lt;b&gt;Sam&lt;/b&gt;,</div><div><br></div><div>See you &amp; bye</div>'
      );
    });
  });

  describe('splitDraftBody', () => {
    it('puts AI text above the signature and quoted reply', () => {
      const body =
        '<div>old</div><signature id="s">-- A</signature><blockquote class="gmail_quote">q</blockquote>';
      expect(splitDraftBody(body)).toEqual({
        head: '<div>old</div>',
        tail: '<signature id="s">-- A</signature><blockquote class="gmail_quote">q</blockquote>',
      });
    });

    it('treats a body with no signature or quote as all head', () => {
      expect(splitDraftBody('<div>hello</div>')).toEqual({ head: '<div>hello</div>', tail: '' });
    });
  });

  describe('Markdown', () => {
    const render = (text: string) => ReactDOMServer.renderToStaticMarkup(<Markdown text={text} />);

    it('makes only links to your own threads clickable', () => {
      const html = render(
        'See [Re: [lumen/api] Fix](sift://thread/t:abc) and [reset password](https://evil.example)'
      );
      expect(html).toContain('class="sift-thread-link"');
      expect(html).toContain('Re: [lumen/api] Fix');
      expect(html).not.toContain('evil.example');
      expect(html).toContain('reset password');
    });

    it('never renders HTML from model output', () => {
      const html = render('Hello <img src=x onerror=alert(1)> **world**');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).toContain('<strong>world</strong>');
    });

    it('renders headings and lists', () => {
      const html = render('## Today\n- one\n- two\n\n1. first');
      expect(html).toContain('<h3>Today</h3>');
      expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
      expect(html).toContain('<ol><li>first</li></ol>');
    });
  });
});
