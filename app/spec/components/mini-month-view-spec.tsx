import React from 'react';
import moment from 'moment';
import { act, cleanup, render } from '@testing-library/react';

import { MiniMonthView } from '../../src/components/mini-month-view';

describe('MiniMonthView', () => {
  afterEach(cleanup);

  it('moves the today marker across midnight while mounted', () => {
    let view: MiniMonthView | null = null;
    const { container } = render(
      <MiniMonthView ref={(instance) => (view = instance)} value={moment()} onChange={() => {}} />
    );
    const initialToday = view.state.today.clone();

    expect(container.querySelector('.day.today')?.textContent).toBe(initialToday.format('D'));

    act(() => view._refreshToday(initialToday.clone().add(1, 'day')));

    expect(container.querySelector('.day.today')?.textContent).toBe(
      initialToday.clone().add(1, 'day').format('D')
    );
    expect(container.querySelectorAll('.day.today').length).toBe(1);
  });
});
