import { EventEmitter } from 'events';
import childProcess from 'child_process';
import DatabaseStore from '../../src/flux/stores/database-store';

describe('DatabaseStore._query', () => {
  let wasOpen;

  beforeEach(() => {
    jasmine.unspy(DatabaseStore, '_query');
    wasOpen = DatabaseStore._open;
    DatabaseStore._open = true;
  });

  afterEach(() => {
    DatabaseStore._open = wasOpen;
    DatabaseStore._agent = null;
    DatabaseStore._agentSpawnFailed = false;
  });

  it('rejects when the query fails in this process', async () => {
    spyOn(DatabaseStore, '_executeLocally').andCallFake(async () => {
      throw new Error('no such column: foo');
    });
    let error = null;
    await DatabaseStore._query('SELECT foo FROM Thread').catch((e) => (error = e));
    expect(error.message).toContain('no such column');
  });

  const startAgent = () => {
    const agent: any = new EventEmitter();
    agent.send = jasmine.createSpy('send');
    agent.kill = () => {};
    spyOn(childProcess, 'fork').andReturn(agent);
    return agent;
  };

  it('runs a query in this process when the agent exits before answering it', async () => {
    const agent = startAgent();
    spyOn(DatabaseStore, '_executeLocally').andCallFake(async () => [{ id: 't1' }]);

    const pending = DatabaseStore._query('SELECT * FROM Thread', [], true);
    await Promise.resolve();
    expect(agent.send).toHaveBeenCalled();
    agent.emit('close', 0); // the agent's 5s idle exit, racing the query

    expect(await pending).toEqual([{ id: 't1' }]);
    expect(DatabaseStore._agent).toBe(null);
  });

  it('rejects that query if it fails in this process too', async () => {
    const agent = startAgent();
    spyOn(DatabaseStore, '_executeLocally').andCallFake(async () => {
      throw new Error('unable to open database file');
    });

    const pending = DatabaseStore._query('SELECT * FROM Thread', [], true);
    await Promise.resolve();
    agent.emit('close', 1);

    let error = null;
    await pending.catch((e) => (error = e));
    expect(error.message).toContain('unable to open database file');
  });
});
