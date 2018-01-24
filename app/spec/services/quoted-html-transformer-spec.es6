const fs = require('fs');
const path = require('path');
const QuotedHTMLTransformer = require('../../src/services/quoted-html-transformer').default;

describe('QuotedHTMLTransformer', function() {
  const readFile = function(fname) {
    const emailPath = path.resolve(__dirname, '..', 'fixtures', 'emails', fname);
    return fs.readFileSync(emailPath, 'utf8');
  };

  const removeQuotedHTML = function(fname, opts) {
    if (opts == null) {
      opts = {};
    }
    return QuotedHTMLTransformer.removeQuotedHTML(readFile(fname), opts);
  };

  for (let n = 1; n <= 28; n++) {
    it(`properly parses email_${n}`, function() {
      const opts = { keepIfWholeBodyIsQuote: true };
      const actual = removeQuotedHTML(`email_${n}.html`, opts).trim();
      const expected = readFile(`email_${n}_stripped.html`).trim();
      if (actual !== expected) {
        fs.writeFileSync(
          path.resolve(__dirname, '..', 'fixtures', 'emails', `email_${n}_actual.html`),
          actual
        );
      }
      expect(actual).toEqual(expected);
    });
  }

  describe('manual quote detection tests', function() {
    const clean = str => str.replace(/[\n\r]/g, '').replace(/\s{2,}/g, ' ');

    // The key is the inHTML. The value is the outHTML
    const tests = [];

    // Test 1
    tests.push({
      before: `\
<div>
  Some text

  <p>More text</p>

  <blockquote id="inline-parent-quote">
    Parent
    <blockquote id="inline-sub-quote">
      Sub
      <blockquote id="inline-sub-sub-quote">Sub Sub</blockquote>
      Sub
    </blockquote>
  </blockquote>

  <div>Text at end</div>

  <blockquote id="last-quote">
    <blockquote>
      The last quote!
    </blockquote>
  </blockquote>


</div>\
`,
      after: `\
<div>
  Some text

  <p>More text</p>

  <blockquote id="inline-parent-quote">
    Parent
    <blockquote id="inline-sub-quote">
      Sub
      <blockquote id="inline-sub-sub-quote">Sub Sub</blockquote>
      Sub
    </blockquote>
  </blockquote>

  <div>Text at end</div></div>\
`,
    });

    // Test 2: Basic quote removal
    tests.push({
      before: `\
<br>
Yo
<blockquote>Nothing but quotes</blockquote>
<br>
<br>\
`,
      after: `\
<br>
Yo\
`,
    });

    // Test 3: It found the blockquote in another div
    tests.push({
      before: `\
<div>Hello World</div>
<br>
<div>
  <blockquote>Nothing but quotes</blockquote>
</div>
<br>
<br>\
`,
      after: `\
<div>Hello World</div>`,
    });

    // Test 4: It works inside of a wrapped div
    tests.push({
      before: `\
Reply here
<div>
  <br>
  <blockquote>Nothing but quotes</blockquote>
  <br>
  <br>
</div>\
`,
      after: 'Reply here',
    });

    // Test 5: Inline quotes and text
    tests.push({
      before: `\
Hello
<blockquote>Inline quote</blockquote>
World\
`,
      after: `\
Hello
<blockquote>Inline quote</blockquote>
World\
`,
    });

    // Test 6: No quoted elements at all
    tests.push({
      before: `\
Hello World\
`,
      after: `\
Hello World\
`,
    });

    // Test 7: Common ancestor is a quoted node
    tests.push({
      before: `\
<div>Content</div>
<blockquote>
  Some content
  <blockquote>More content</blockquote>
  Other content
</blockquote>\
`,
      after: `\
<div>Content</div>\
`,
    });

    // Test 8: All of our quote blocks we want to remove are at the end…
    // sortof… but nested in a bunch of stuff
    //
    // Note that "content" is burried deep in the middle of a div
    tests.push({
      before: `\
<div>Content</div>
<blockquote>
  Some content
  <blockquote>More content</blockquote>
  Other content
</blockquote>
<div>
  <blockquote>Some text quote</blockquote>
  Some text
  <div>
    More text
    <blockquote>A quote</blockquote>
    <br>
  </div>
  <br>
  <blockquote>Another quote</blockquote>
  <br>
</div>
<br>
<blockquote>More quotes!</blockquote>\
`,
      after: `\
<div>Content</div>
<blockquote>
  Some content
  <blockquote>More content</blockquote>
  Other content
</blockquote>
<div>
  <blockquote>Some text quote</blockquote>
  Some text
  <div>
    More text </div></div>\
`,
    });

    // Test 9: Last several tags are blockquotes. Note the 3 blockquote
    // at the end, the interstital div, and the blockquote inside of the
    // first div
    tests.push({
      before: `\
<div>
  <blockquote>I'm inline</blockquote>
  Content
  <blockquote>Remove me</blockquote>
</div>
<blockquote>Foo</blockquote>
<div></div>
<blockquote>Bar</blockquote>
<blockquote>Baz</blockquote>\
`,
      after: `\
<div>
  <blockquote>I'm inline</blockquote>
  Content </div>\
`,
    });

    // Test 10: If it's only a quote and no other text, then just show the
    // quote
    tests.push({
      before: `\
<br>
<blockquote>Nothing but quotes</blockquote>
<br>
<br>\
`,
      after: `\
<br>
<blockquote>Nothing but quotes</blockquote>
<br>
<br>\
`,
    });

    // Test 11: The <body> tag itself is just a quoted text block.
    // I believe this is https://sentry.nylas.com/sentry/edgehill/group/8323/
    tests.push({
      before: `\
<body class="gmail_quote">
  This entire thing is quoted text!
</body>\
`,
      after: '<head></head><body></body>',
      options: { keepIfWholeBodyIsQuote: false },
    });

    // Test 12: Make sure that a single quote inside of a bunch of other
    // content is detected. We used to have a bug where we were only
    // looking at the common ancestor of blockquotes (and if there's 1 then
    // the ancestor is itself). We now look at the root document for
    // trailing text.
    tests.push({
      before: `\
<br>
Yo
<table><tbody>
  <tr><td>A</td><td>B</td></tr>
  <tr><td>C</td><td><blockquote>SAVE ME</blockquote></td></tr>
  <tr><td>E</td><td>F</td></tr>
</tbody></table>
Yo
<br>\
`,
      after: `\
<br>
Yo
<table><tbody>
  <tr><td>A</td><td>B</td></tr>
  <tr><td>C</td><td><blockquote>SAVE ME</blockquote></td></tr>
  <tr><td>E</td><td>F</td></tr>
</tbody></table>
Yo\
`,
    });

    // Test 13: If there's an "On date…" string immediatley before a blockquote,
    // then remove it.
    tests.push({
      before: `\
Hey
<div>
  On FOOBAR
  <br>
  On Thu, Mar 3, 2016
  at 3:19 AM,
  First Middle Last-Last
  <span dir="ltr">
    &lt;
    <a href="mailto:test@nylas.com" target="_blank">
      test@nylas.com
    </a>
    &gt;
  </span>
  wrote:
  <br>
  <blockquote>
    QUOTED TEXT
  </blockquote>
</div>
<br>\
`,
      after: `\
Hey
<div>
  On FOOBAR </div>\
`,
    });

    // Test 14: Don't pick up false positives on the string precursors to block
    // quotes.
    tests.push({
      before: `\
Hey
<div>
On FOOBAR
<br>
On Thu, Mar 3, 2016 I went to my writing club and wrote:
<strong>A little song</strong>
<blockquote>
  QUOTED TEXT
</blockquote></div>\
`,
      after: `\
Hey
<div>
On FOOBAR
<br>
On Thu, Mar 3, 2016 I went to my writing club and wrote:
<strong>A little song</strong></div>\
`,
    });

    it('works with these manual test cases', () =>
      (() => {
        const result = [];
        for (let { before, after, options } of tests) {
          if (!options) {
            options = { keepIfWholeBodyIsQuote: true };
          }
          const test = clean(QuotedHTMLTransformer.removeQuotedHTML(before, options));
          result.push(expect(test).toEqual(clean(after)));
        }
        return result;
      })());

    it('removes all trailing <br> tags', function() {
      const input0 = 'hello world<br><br><blockquote>foolololol</blockquote>';
      const expect0 = 'hello world';
      expect(QuotedHTMLTransformer.removeQuotedHTML(input0)).toEqual(expect0);
    });

    it('preserves <br> tags in the middle and only chops off tail', function() {
      const input0 = 'hello<br><br>world<br><br><blockquote>foolololol</blockquote>';
      const expect0 = 'hello<br>world';
      expect(QuotedHTMLTransformer.removeQuotedHTML(input0)).toEqual(expect0);
    });

    it('works as expected when body tag inside the html', function() {
      const input0 = `\
<br><br><blockquote class="gmail_quote"
  style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex;">
  On Dec 16 2015, at 7:08 pm, Juan Tejada &lt;juan@nylas.com&gt; wrote:
  <br>


<meta content="text/html; charset=us-ascii" />

<body>
<h1 id="h2">h2</h1>
<p>he he hehehehehehe</p>
<p>dufjcasc</p></blockquote>\
`;
      const expect0 = '<head></head><body></body>';
      expect(
        QuotedHTMLTransformer.removeQuotedHTML(input0, { keepIfWholeBodyIsQuote: false })
      ).toEqual(expect0);
    });
  });

  // We have a little utility method that you can manually uncomment to
  // generate what the current iteration of the QuotedHTMLTransformer things the
  // `removeQuotedHTML` should look like. These can be manually inspected in
  // a browser before getting their filename changed to
  // `email_${n}_stripped.html". The actually tests will run the current
  // iteration of the `removeQuotedHTML` against these files to catch if
  // anything has changed in the parser.
  //
  // It's inside of the specs here instaed of its own script because the
  // `QuotedHTMLTransformer` needs Electron booted up in order to work because
  // of the DOMParser.
  xit('Run this simple function to generate output files', () =>
    [18, 20].forEach(function(n) {
      const newHTML = QuotedHTMLTransformer.removeQuotedHTML(readFile(`email_${n}.html`));
      const outPath = path.resolve(
        __dirname,
        '..',
        'fixtures',
        'emails',
        `email_${n}_raw_stripped.html`
      );
      fs.writeFileSync(outPath, newHTML);
    }));
});
