import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Table, EditableTableCell, EditableTable } from 'mailspring-component-kit';
import { cellProps, tableProps } from '../fixtures/table-data';

describe('EditableTable Components', function describeBlock() {
  afterEach(cleanup);

  describe('EditableTableCell', () => {
    function renderCell(props = {}) {
      // Provide a valid table > tbody > tr DOM structure to avoid browser warnings
      const table = document.createElement('table');
      document.body.appendChild(table);
      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      const tr = document.createElement('tr');
      tbody.appendChild(tr);
      const result = render(<EditableTableCell {...cellProps} {...props} />, { container: tr });
      return result;
    }

    describe('onInputBlur', () => {
      it('should call onCellEdited if value is different from current value', () => {
        const onCellEdited = jasmine.createSpy('onCellEdited');
        // testDataSource.cellAt({rowIdx:0, colIdx:0}) === 1, so 'new-val' is different
        const { container } = renderCell({ onCellEdited, isHeader: false });
        const input = container.querySelector('input');
        fireEvent.blur(input, { target: { value: 'new-val' } });
        expect(onCellEdited).toHaveBeenCalledWith({
          rowIdx: 0,
          colIdx: 0,
          value: 'new-val',
          isHeader: false,
        });
      });

      it('should not call onCellEdited otherwise', () => {
        const onCellEdited = jasmine.createSpy('onCellEdited');
        // Use a data source with a string value so it matches exactly what the input reports on blur.
        // The onInputBlur handler uses strict inequality (value !== currentValue), so
        // we need the string in the input to match the string stored in the data source.
        const existingValue = 'existing-val';
        const customDataSource = new Table.TableDataSource({
          columns: ['col1'],
          rows: [[existingValue]],
        });
        const { container } = renderCell({
          onCellEdited,
          tableDataSource: customDataSource,
          rowIdx: 0,
          colIdx: 0,
        });
        const input = container.querySelector('input');
        // Blur with the same value that is already in the cell — no change
        fireEvent.blur(input, { target: { value: existingValue } });
        expect(onCellEdited).not.toHaveBeenCalled();
      });
    });

    describe('onInputKeyDown', () => {
      it('calls onAddRow if Enter pressed and cell is in last row', () => {
        const onAddRow = jasmine.createSpy('onAddRow');
        // rowIdx: 2 is the last row in testDataSource (3 rows: 0,1,2)
        const { container } = renderCell({ rowIdx: 2, onAddRow });
        const input = container.querySelector('input');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onAddRow).toHaveBeenCalled();
      });

      it('stops event propagation and focuses inputContainer div if Escape pressed', () => {
        const { container } = renderCell();
        const input = container.querySelector('input');
        // The inputContainer is the div with tabIndex=0 that wraps the input
        const inputContainer = container.querySelector('[tabindex="0"]') as HTMLElement;

        let focused = false;
        const origFocus = inputContainer.focus.bind(inputContainer);
        inputContainer.focus = () => {
          focused = true;
          origFocus();
        };

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(focused).toBe(true);
      });
    });

    it('renders a cell with the correct data from the tableDataSource', () => {
      // cellAt({rowIdx:0, colIdx:0}) === 1; verify the input renders with defaultValue '1'
      const { container } = renderCell();
      const input = container.querySelector('input');
      expect(input).not.toBeNull();
      // defaultValue is set as a DOM property (React coerces the number to a string)
      expect((input as HTMLInputElement).defaultValue).toBe('1');
    });

    it('renders the InputRenderer with the correct props passed through', () => {
      // testDataSource.cellAt({rowIdx:2, colIdx:2}) === 9
      const InputRenderer = (props) => (
        <input
          data-testid="custom-input"
          data-rowidx={props.rowIdx}
          data-colidx={props.colIdx}
          data-p1={props.p1}
          defaultValue={props.defaultValue}
        />
      );
      const inputProps = { p1: 'p1' };
      const { container } = renderCell({
        rowIdx: 2,
        colIdx: 2,
        inputProps,
        InputRenderer,
      });

      const input = container.querySelector('[data-testid="custom-input"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.getAttribute('data-rowidx')).toBe('2');
      expect(input.getAttribute('data-colidx')).toBe('2');
      expect(input.getAttribute('data-p1')).toBe('p1');
      // The defaultValue passed to InputRenderer is the cell value at row 2, col 2 = 9
      expect(input.defaultValue).toBe('9');
    });
  });

  describe('EditableTable', () => {
    function renderTable(props = {}) {
      return render(<EditableTable {...tableProps} {...props} />);
    }

    it('renders column buttons if onAddColumn and onRemoveColumn are provided', () => {
      const onAddColumn = () => {};
      const onRemoveColumn = () => {};
      const { container } = renderTable({ onAddColumn, onRemoveColumn });
      expect(container.firstElementChild.classList.contains('editable-table-container')).toBe(true);
      expect(container.querySelectorAll('.btn').length).toBe(2);
    });

    it('renders only a SelectableTable if column callbacks are not provided', () => {
      const { container } = renderTable();
      expect(container.querySelectorAll('.btn').length).toBe(0);
    });

    it('renders a table with the editable-table class and uses the provided InputRenderer', () => {
      const onAddRow = () => {};
      const onCellEdited = () => {};
      const inputProps = {};
      const InputRenderer = () => <input data-testid="custom-renderer" />;
      const { container } = renderTable({
        onAddRow,
        onCellEdited,
        inputProps,
        InputRenderer,
      });

      // The SelectableTable receives className='editable-table' from EditableTable
      const editableTable = container.querySelector('.editable-table');
      expect(editableTable).not.toBeNull();

      // The custom InputRenderer should be rendered for each cell in the table
      const customInputs = container.querySelectorAll('[data-testid="custom-renderer"]');
      expect(customInputs.length).toBeGreaterThan(0);
    });
  });
});
