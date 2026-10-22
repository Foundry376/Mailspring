import React from 'react';
import { cleanup, render } from '@testing-library/react';

import { OutlineView } from '../../src/components/outline-view';

describe('OutlineView', () => {
  afterEach(cleanup);

  it('shows its children in place of items until collapsed', () => {
    const { container, rerender } = render(
      <OutlineView title="Work">
        <div className="row">Team</div>
      </OutlineView>
    );
    expect(container.querySelector('.row').textContent).toBe('Team');

    rerender(
      <OutlineView title="Work">
        <div className="row">Holidays</div>
      </OutlineView>
    );
    expect(container.querySelector('.row').textContent).toBe('Holidays');

    rerender(
      <OutlineView title="Work" collapsed onCollapseToggled={() => {}}>
        <div className="row">Holidays</div>
      </OutlineView>
    );
    expect(container.querySelector('.row')).toBe(null);
  });
});
