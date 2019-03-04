import React from 'react';
import { mount } from 'enzyme';
import { ContactStore, Contact } from 'mailspring-exports';

import { ParticipantsTextField } from 'mailspring-component-kit';

const participant1 = new Contact({
  id: 'local-1',
  email: 'ben@mailspring.com',
});
const participant2 = new Contact({
  id: 'local-2',
  email: 'ben@example.com',
  name: 'Ben Gotow',
});
const participant3 = new Contact({
  id: 'local-3',
  email: 'evan@mailspring.com',
  name: 'Evan Morikawa',
});

xdescribe('ParticipantsTextField', function ParticipantsTextFieldSpecs() {
  beforeEach(() => {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    this.propChange = jasmine.createSpy('change');

    this.fieldName = 'to';
    this.participants = {
      to: [participant1, participant2],
      cc: [participant3],
      bcc: [],
    };

    this.renderedField = mount(
      <ParticipantsTextField
        field={this.fieldName}
        menuPrompt={this.fieldName}
        visible
        participants={this.participants}
        draft={{ id: 'draft-1' }}
        session={{}}
        change={this.propChange}
      />
    );
    this.renderedInput = this.renderedField.find('input');

    this.expectInputToYield = (input, expected) => {
      const reviver = function reviver(k, v) {
        if (k === 'id' || k === 'client_id' || k === 'server_id' || k === 'object') {
          return undefined;
        }
        return v;
      };
      runs(() => {
        this.renderedInput.simulate('change', { target: { value: input } });
        advanceClock(100);
        return this.renderedInput.simulate('keyDown', { key: 'Enter', keyCode: 9 });
      });
      waitsFor(() => {
        return this.propChange.calls.length > 0;
      });
      runs(() => {
        let found = this.propChange.mostRecentCall.args[0];
        found = JSON.parse(JSON.stringify(found), reviver);
        expect(found).toEqual(JSON.parse(JSON.stringify(expected), reviver));

        // This advance clock needs to be here because our waitsFor latch
        // catches the first time that propChange gets called. More stuff
        // may happen after this and we need to advance the clock to
        // "clear" all of that. If we don't do this it throws errors about
        // `setState` being called on unmounted components :(
        return advanceClock(100);
      });
    };
  });

  it('renders into the document', () => {
    expect(this.renderedField.find(ParticipantsTextField).length).toBe(1);
  });

  describe('inserting participant text', () => {
    it('should fire onChange with an updated participants hash', () => {
      this.expectInputToYield('abc@abc.com', {
        to: [
          participant1,
          participant2,
          new Contact({ name: 'abc@abc.com', email: 'abc@abc.com' }),
        ],
        cc: [participant3],
        bcc: [],
      });
    });

    it('should remove added participants from other fields', () => {
      this.expectInputToYield(participant3.email, {
        to: [
          participant1,
          participant2,
          new Contact({ name: participant3.email, email: participant3.email }),
        ],
        cc: [],
        bcc: [],
      });
    });

    it('should use the name of an existing contact in the ContactStore if possible', () => {
      spyOn(ContactStore, 'searchContacts').andCallFake(val => {
        if (val === participant3.name) {
          return Promise.resolve([participant3]);
        }
        return Promise.resolve([]);
      });

      this.expectInputToYield(participant3.name, {
        to: [participant1, participant2, participant3],
        cc: [],
        bcc: [],
      });
    });

    it("should use the plain email if that's what's entered", () => {
      spyOn(ContactStore, 'searchContacts').andCallFake(val => {
        if (val === participant3.name) {
          return Promise.resolve([participant3]);
        }
        return Promise.resolve([]);
      });

      this.expectInputToYield(participant3.email, {
        to: [participant1, participant2, new Contact({ email: 'evan@mailspring.com' })],
        cc: [],
        bcc: [],
      });
    });

    it('should not have the same contact auto-picked multiple times', () => {
      spyOn(ContactStore, 'searchContacts').andCallFake(val => {
        if (val === participant2.name) {
          return Promise.resolve([participant2]);
        }
        return Promise.resolve([]);
      });

      this.expectInputToYield(participant2.name, {
        to: [
          participant1,
          participant2,
          new Contact({ email: participant2.name, name: participant2.name }),
        ],
        cc: [participant3],
        bcc: [],
      });
    });

    describe('when text contains Name (Email) formatted data', () => {
      it('should correctly parse it into named Contact objects', () => {
        const newContact1 = new Contact({
          id: 'b1',
          name: 'Ben Imposter',
          email: 'imposter@mailspring.com',
        });
        const newContact2 = new Contact({ name: 'Mailspring Team', email: 'feedback@mailspring.com' });

        const inputs = [
          'Ben Imposter <imposter@mailspring.com>, Mailspring Team <feedback@mailspring.com>',
          '\n\nbla\nBen Imposter (imposter@mailspring.com), Mailspring Team (feedback@mailspring.com)',
          'Hello world! I like cheese. \rBen Imposter (imposter@mailspring.com)\nMailspring Team (feedback@mailspring.com)',
          'Ben Imposter<imposter@mailspring.com>Mailspring Team (feedback@mailspring.com)',
        ];

        for (const input of inputs) {
          this.expectInputToYield(input, {
            to: [participant1, participant2, newContact1, newContact2],
            cc: [participant3],
            bcc: [],
          });
        }
      });
    });

    describe('when text contains emails mixed with garbage text', () => {
      it('should still parse out emails into Contact objects', () => {
        const newContact1 = new Contact({
          id: 'gm',
          name: 'garbage-man@mailspring.com',
          email: 'garbage-man@mailspring.com',
        });
        const newContact2 = new Contact({
          id: 'rm',
          name: 'recycling-guy@mailspring.com',
          email: 'recycling-guy@mailspring.com',
        });

        const inputs = [
          "Hello world I real. \n asd. garbage-man@mailspring.com—he's cool Also 'recycling-guy@mailspring.com'!",
          'garbage-man@mailspring.com1WHOA I REALLY HATE DATA,recycling-guy@mailspring.com',
          'nils.com garbage-man@mailspring.com @mailspring.com nope@.com nope! recycling-guy@mailspring.com HOLLA AT recycling-guy@mailspring.',
        ];

        for (const input of inputs) {
          this.expectInputToYield(input, {
            to: [participant1, participant2, newContact1, newContact2],
            cc: [participant3],
            bcc: [],
          });
        }
      });
    });
  });
});
