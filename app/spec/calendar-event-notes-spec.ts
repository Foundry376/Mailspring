import http from 'http';

import { extractNotesFromDescription } from '../internal_packages/main-calendar/lib/core/calendar-helpers';

describe('extractNotesFromDescription', function () {
  it('keeps each line of a description written as <br>-separated HTML', function () {
    // The shape Google writes.
    expect(
      extractNotesFromDescription(
        'What happened last week?<br>What is the plan?<br><br>Keep it short.'
      )
    ).toBe('What happened last week?\nWhat is the plan?\nKeep it short.');
  });

  it('puts each paragraph of a description on its own line', function () {
    expect(extractNotesFromDescription('<p>First</p><p>Second</p>')).toBe('First\nSecond\n');
  });

  it('puts each item of a list between <br> lines on its own line', function () {
    // The shape Google writes for a bulleted agenda.
    expect(
      extractNotesFromDescription('Agenda:<br><ul><li>Budget</li><li>Hiring</li></ul><br>Thanks')
    ).toBe('Agenda:\nBudget\nHiring\nThanks');
  });

  it('reads a plain-text description as it was', function () {
    expect(extractNotesFromDescription('Line one\nLine two')).toBe('Line one\nLine two');
  });

  it('reads the notes from itemprop=description meta tags that lead the description', function () {
    expect(
      extractNotesFromDescription(
        '<meta itemprop="description" content="Quarterly planning"><meta itemprop="description" content="Bring laptops">'
      )
    ).toBe('Quarterly planning\nBring laptops');
  });

  describe('an image in the description', function () {
    let server: http.Server;
    let requested: string[];
    let origin: string;

    beforeEach(function () {
      requested = [];
      server = http.createServer((req, res) => {
        requested.push(req.url);
        res.writeHead(404);
        res.end();
      });
      let listening = false;
      server.listen(0, '127.0.0.1', () => {
        origin = `http://127.0.0.1:${(server.address() as any).port}`;
        listening = true;
      });
      waitsFor(() => listening, 'the local server to listen', 2000);
    });

    afterEach(function () {
      server.close();
    });

    it('is never fetched', function () {
      runs(() => {
        expect(
          extractNotesFromDescription(`Agenda <img src="${origin}/from-description.gif">`)
        ).toBe('Agenda ');
        // Requested after the notes are read, from the same server: once it arrives, so would the other.
        new Image().src = `${origin}/control.gif`;
      });
      waitsFor(() => requested.includes('/control.gif'), 'the control image request', 2000);
      runs(() => expect(requested).not.toContain('/from-description.gif'));
    });
  });
});
