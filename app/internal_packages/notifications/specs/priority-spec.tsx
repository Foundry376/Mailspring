import { render, cleanup, act } from '@testing-library/react';
import { ComponentRegistry, React } from 'mailspring-exports';
import { Notification } from 'mailspring-component-kit';

import NotifWrapper from '../lib/notif-wrapper';

const stubNotif = (priority: number) => {
  return class extends React.Component {
    static displayName = `NotifPriority${priority}`;
    static containerRequired = false;
    render() {
      return <Notification priority={`${priority}`} title={`Priority ${priority}`} />;
    }
  };
};

const checkHighestPriority = (expectedPriority: number, container: HTMLElement) => {
  const visibleElems = container.querySelectorAll('.highest-priority');
  expect(visibleElems.length).toEqual(1);

  const titleElem = visibleElems[0].querySelector('.title');
  expect(titleElem.textContent.trim()).toEqual(`Priority ${expectedPriority}`);
};

const trigger = async () => {
  await act(async () => {
    ComponentRegistry.trigger();
  });
};

describe('NotifPriority', function notifPriorityTests() {
  let container;

  beforeEach(() => {
    ({ container } = render(<NotifWrapper />));
  });

  afterEach(cleanup);

  describe('When there is only one notification', () => {
    beforeEach(async () => {
      ComponentRegistry._clear();
      ComponentRegistry.register(stubNotif(5), { role: 'RootSidebar:Notifications' });
      await trigger();
    });
    it('should mark it as highest-priority', () => {
      checkHighestPriority(5, container);
    });
  });

  describe('when there are multiple notifications', () => {
    let components;
    beforeEach(async () => {
      components = [stubNotif(5), stubNotif(7), stubNotif(3), stubNotif(2)];
      ComponentRegistry._clear();
      components.forEach((item) => {
        ComponentRegistry.register(item, { role: 'RootSidebar:Notifications' });
      });
      await trigger();
    });
    it('should mark the proper one as highest-priority', () => {
      checkHighestPriority(7, container);
    });
    it('properly updates when a highest-priority notification is removed', async () => {
      ComponentRegistry.unregister(components[1]);
      await trigger();
      checkHighestPriority(5, container);
    });
    it('properly updates when a higher priority notifcation is added', async () => {
      ComponentRegistry.register(stubNotif(10), { role: 'RootSidebar:Notifications' });
      await trigger();
      checkHighestPriority(10, container);
    });
  });
});
