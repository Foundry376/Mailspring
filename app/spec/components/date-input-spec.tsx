import React from 'react';
import { mount } from 'enzyme';

import { DateUtils } from 'mailspring-exports';
import DateInput from '../../src/components/date-input';

describe('DateInput', function dateInput() {
  describe('onInputKeyDown', () => {
    it('should submit the input if Enter or Return pressed', () => {
      spyOn(DateUtils, 'futureDateFromString').andReturn('someday');

      ['Enter', 'Return'].forEach(key => {
        const onDateSubmitted = jasmine.createSpy('onDateSubmitted');
        const component = mount(<DateInput onDateSubmitted={onDateSubmitted} dateFormat="blah" />);
        const inputNode = component.find('input');
        const stopPropagation = jasmine.createSpy('stopPropagation');
        (inputNode.getDOMNode() as any).value = 'tomorrow';

        inputNode.simulate('keyDown', { key, stopPropagation });
        expect(stopPropagation).toHaveBeenCalled();
        expect(onDateSubmitted).toHaveBeenCalledWith('someday', 'tomorrow');
      });
    });
  });

  describe('render', () => {
    beforeEach(() => {
      spyOn(DateUtils, 'format').andReturn('formatted');
    });

    it('should render a date interpretation if a date has been inputted', () => {
      const component = mount(
        <DateInput dateFormat="YYYY-MM-DD" initialTestState={{ inputDate: 'something!' }} />
      );
      spyOn(component, 'setState');
      const dateInterpretation = component.find('.date-interpretation');
      expect(dateInterpretation.text()).toEqual('formatted');
    });

    it('should not render a date interpretation if no input date available', () => {
      const component = mount(
        <DateInput dateFormat="YYYY-MM-DD" initialTestState={{ inputDate: null }} />
      );
      spyOn(component, 'setState');
      expect(component.find('.date-interpretation').exists()).toBe(false);
    });
  });
});
