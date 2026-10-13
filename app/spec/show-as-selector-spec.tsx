import React from 'react';
import ReactDOM from 'react-dom';
import {
  ShowAsSelector,
  defaultShowAs,
} from '../internal_packages/main-calendar/lib/core/show-as-selector';

describe('defaultShowAs', function () {
  it('starts an all-day event Free and a timed one Busy', function () {
    expect(defaultShowAs(true)).toBe('TRANSPARENT');
    expect(defaultShowAs(false)).toBe('OPAQUE');
  });
});

describe('ShowAsSelector', function () {
  let host: HTMLDivElement;

  beforeEach(function () {
    host = document.createElement('div');
  });
  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
  });

  it('offers Busy and Free, as the two TRANSP values', function () {
    ReactDOM.render(<ShowAsSelector value="OPAQUE" onChange={() => {}} />, host);
    const options = Array.from(host.querySelectorAll('option')).map((o) => [
      o.value,
      o.textContent,
    ]);
    expect(options).toEqual([
      ['OPAQUE', 'Busy'],
      ['TRANSPARENT', 'Free'],
    ]);
  });
});
