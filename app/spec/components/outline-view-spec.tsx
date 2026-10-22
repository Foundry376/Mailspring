import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';

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

  it('puts a caret right after the title only when it can collapse', () => {
    const onCollapseToggled = jasmine.createSpy('onCollapseToggled');
    const { container, rerender } = render(<OutlineView title="Work" items={[]} />);
    expect(container.querySelector('.heading .collapse-button')).toBe(null);

    rerender(<OutlineView title="Work" items={[]} onCollapseToggled={onCollapseToggled} />);
    const caret = container.querySelector('.heading .text + .collapse-button');
    expect(caret.querySelector('.disclosure-triangle')).not.toBe(null);
    expect(caret.textContent).toBe('');
    expect(caret.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(caret);
    expect(onCollapseToggled).toHaveBeenCalled();

    rerender(
      <OutlineView title="Work" items={[]} collapsed onCollapseToggled={onCollapseToggled} />
    );
    expect(caret.getAttribute('aria-expanded')).toBe('false');
    expect(caret.querySelector('.disclosure-triangle.collapsed')).not.toBe(null);
  });
});
