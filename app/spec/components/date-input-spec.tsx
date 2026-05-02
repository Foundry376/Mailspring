import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { DateUtils } from 'mailspring-exports';
import DateInput from '../../src/components/date-input';

describe('DateInput', function dateInput() {
  afterEach(cleanup);

  describe('onInputKeyDown', () => {
    it('should submit the input if Enter or Return pressed', () => {
      // fakeMoment satisfies both code paths that run during this test:
      //   1. onInputKeyDown calls futureDateFromString → passes result to onDateSubmitted
      //   2. React's controlled-input reconciliation detects the DOM value changed and
      //      calls onInputChange, which calls nextDate.clone() and DateUtils.format(nextDate)
      const fakeMoment = { clone: () => fakeMoment, format: () => 'formatted' };
      spyOn(DateUtils, 'futureDateFromString').andReturn(fakeMoment);

      ['Enter', 'Return'].forEach((key) => {
        const onDateSubmitted = jasmine.createSpy('onDateSubmitted');
        const { container } = render(
          <DateInput onDateSubmitted={onDateSubmitted} dateFormat="blah" />
        );
        const inputEl = container.querySelector('input') as HTMLInputElement;

        // Set the DOM input's value directly so onInputKeyDown sees value.length > 0,
        // then fire the keyDown event.
        inputEl.value = 'tomorrow';
        fireEvent.keyDown(inputEl, { key });

        expect(onDateSubmitted).toHaveBeenCalledWith(fakeMoment, 'tomorrow');
      });
    });
  });

  describe('render', () => {
    beforeEach(() => {
      spyOn(DateUtils, 'format').andReturn('formatted');
    });

    it('should render a date interpretation if a date has been inputted', () => {
      const { container } = render(
        <DateInput dateFormat="YYYY-MM-DD" initialTestState={{ inputDate: 'something!' }} />
      );
      const dateInterpretation = container.querySelector('.date-interpretation');
      expect(dateInterpretation.textContent).toEqual('formatted');
    });

    it('should not render a date interpretation if no input date available', () => {
      const { container } = render(
        <DateInput dateFormat="YYYY-MM-DD" initialTestState={{ inputDate: null }} />
      );
      // When inputDate is falsy the component renders an empty <span /> with no class.
      expect(container.querySelector('.date-interpretation')).toBe(null);
    });
  });
});
