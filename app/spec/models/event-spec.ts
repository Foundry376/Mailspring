import { Event } from '../../src/flux/models/event';

const json_event = {
  __cls: 'Event',
  id: '4ee4xbnx7pxdb9g7c2f8ncyto',
  calendar_id: 'ci0k1wfyv533ccgox4t7uri4h',
  account_id: '14e5bn96uizyuhidhcw5rfrb0',
  description: null,
  location: null,
  participants: [
    {
      email: 'example@gmail.com',
      name: 'Ben Bitdiddle',
      status: 'yes',
    },
  ],
  read_only: false,
  title: 'Meeting with Ben Bitdiddle',
  when: {
    object: 'timespan',
    end_time: 1408123800,
    start_time: 1408120200,
  },
  busy: true,
  status: 'confirmed',
};

const when_1 = {
  end_time: 1408123800,
  start_time: 1408120200,
};

const participant_1 = {
  name: 'Ethan Blackburn',
  status: 'yes',
  email: 'ethan@mailspring.com',
};

const participant_2 = {
  name: 'Other Person',
  status: 'maybe',
  email: 'other@person.com',
};

const participant_3 = {
  name: 'Another Person',
  status: 'no',
  email: 'another@person.com',
};

const event_1 = {
  title: 'Dolores',
  description: 'Hanging at the park',
  location: 'Dolores Park',
  when: when_1,
  start: 1408120200,
  end: 1408123800,
  participants: [participant_1, participant_2, participant_3],
};

describe('Event', function() {
  it('can be built via the constructor', function() {
    const e1 = new Event(event_1);
    expect(e1.title).toBe('Dolores');
    expect(e1.description).toBe('Hanging at the park');
    expect(e1.location).toBe('Dolores Park');
    expect(e1.when.start_time).toBe(1408120200);
    expect(e1.when.end_time).toBe(1408123800);
    expect(e1.start).toBe(1408120200);
    expect(e1.end).toBe(1408123800);
    expect(e1.participants[0].name).toBe('Ethan Blackburn');
    expect(e1.participants[0].email).toBe('ethan@mailspring.com');
    expect(e1.participants[0].status).toBe('yes');
    expect(e1.participants[1].name).toBe('Other Person');
    expect(e1.participants[1].email).toBe('other@person.com');
    expect(e1.participants[1].status).toBe('maybe');
    expect(e1.participants[2].name).toBe('Another Person');
    expect(e1.participants[2].email).toBe('another@person.com');
    expect(e1.participants[2].status).toBe('no');
  });

  it('accepts a JSON response', function() {
    const e1 = new Event().fromJSON(json_event);
    expect(e1.title).toBe('Meeting with Ben Bitdiddle');
    expect(e1.description).toBe(null);
    expect(e1.location).toBe(null);
    expect(e1.start).toBe(1408120200);
    expect(e1.end).toBe(1408123800);
    expect(e1.participants[0].name).toBe('Ben Bitdiddle');
    expect(e1.participants[0].email).toBe('example@gmail.com');
    expect(e1.participants[0].status).toBe('yes');
  });
});
