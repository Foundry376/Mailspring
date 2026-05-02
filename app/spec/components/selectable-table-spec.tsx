import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { SelectableTableCell, SelectableTableRow, SelectableTable } from 'mailspring-component-kit';
import { selection, cellProps, rowProps, tableProps, testDataSource } from '../fixtures/table-data';

afterEach(cleanup);

describe('SelectableTable Components', function describeBlock() {
  describe('SelectableTableCell', () => {
    function renderCell(props = {}) {
      // SelectableTableCell renders a <td>, which requires valid table DOM context
      return render(
        <table>
          <tbody>
            <tr>
              <SelectableTableCell {...cellProps} {...props}>
                cell content
              </SelectableTableCell>
            </tr>
          </tbody>
        </table>
      );
    }

    it('renders with the appropriate className when selected', () => {
      // Default cellProps: rowIdx=0, colIdx=0, selection={rowIdx:0, colIdx:0} — matches → selected
      const { container } = renderCell();
      const td = container.querySelector('td');
      expect(td.classList.contains('selected')).toBe(true);
    });

    it('renders with the appropriate className when not selected', () => {
      // rowIdx=2, colIdx=1 does not match selection {rowIdx:0, colIdx:0}
      const { container } = renderCell({ rowIdx: 2, colIdx: 1 });
      const td = container.querySelector('td');
      expect(td.classList.contains('selected')).toBe(false);
    });

    it('renders any extra classNames', () => {
      const { container } = renderCell({ className: 'my-cell' });
      const td = container.querySelector('td');
      expect(td.classList.contains('my-cell')).toBe(true);
    });

    describe('selection state', () => {
      it('has selected class when selection rowIdx and colIdx match cell position', () => {
        const { container } = renderCell({
          rowIdx: 1,
          colIdx: 2,
          selection: { rowIdx: 1, colIdx: 2, key: null },
        });
        const td = container.querySelector('td');
        expect(td.classList.contains('selected')).toBe(true);
      });

      it('does not have selected class when selection does not match cell position', () => {
        const { container } = renderCell({
          rowIdx: 1,
          colIdx: 2,
          selection: { rowIdx: 0, colIdx: 0, key: null },
        });
        const td = container.querySelector('td');
        expect(td.classList.contains('selected')).toBe(false);
      });

      it('has selected class when selection key is Enter and position matches', () => {
        // When cell is selected (position matches) AND the key was Enter, it is still "selected"
        const { container } = renderCell({ selection: { ...selection, key: 'Enter' } });
        const td = container.querySelector('td');
        expect(td.classList.contains('selected')).toBe(true);
      });

      it('does not have selected class when selection key differs but position does not match', () => {
        // key alone does not confer selection — position must match too
        const { container } = renderCell({
          rowIdx: 2,
          colIdx: 1,
          selection: { rowIdx: 0, colIdx: 0, key: 'Enter' },
        });
        const td = container.querySelector('td');
        expect(td.classList.contains('selected')).toBe(false);
      });

      it('has selected class when cell is in the last row and position matches', () => {
        // rowIdx=2 is the last row (testDataSource has 3 rows, indices 0–2)
        const { container } = renderCell({
          rowIdx: 2,
          selection: { rowIdx: 2, colIdx: 0, key: null },
        });
        const td = container.querySelector('td');
        expect(td.classList.contains('selected')).toBe(true);
      });

      it('does not have selected class when cell is in last row but position does not match', () => {
        const { container } = renderCell({
          rowIdx: 2,
          selection: { rowIdx: 0, colIdx: 0, key: null },
        });
        const td = container.querySelector('td');
        expect(td.classList.contains('selected')).toBe(false);
      });
    });
  });

  describe('SelectableTableRow', () => {
    function renderRow(props: any = {}) {
      // SelectableTableRow renders a <tr>, which requires valid table DOM context
      return render(
        <table>
          <tbody>
            <SelectableTableRow {...rowProps} {...props} />
          </tbody>
        </table>
      );
    }

    it('renders with the appropriate className when selected', () => {
      // Default rowProps: rowIdx=0, selection={rowIdx:0} — matches → selected
      const { container } = renderRow();
      const tr = container.querySelector('tr');
      expect(tr.classList.contains('selected')).toBe(true);
    });

    it('renders with the appropriate className when not selected', () => {
      // selection.rowIdx=2 does not match rowIdx=0
      const { container } = renderRow({ selection: { rowIdx: 2, colIdx: 0, key: null } });
      const tr = container.querySelector('tr');
      expect(tr.classList.contains('selected')).toBe(false);
    });

    it('renders any extra classNames', () => {
      const { container } = renderRow({ className: 'my-row' });
      const tr = container.querySelector('tr');
      expect(tr.classList.contains('my-row')).toBe(true);
    });

    describe('selection state', () => {
      it('has selected class when selection rowIdx matches row position', () => {
        const { container } = renderRow({
          rowIdx: 1,
          selection: { rowIdx: 1, colIdx: 0, key: null },
        });
        const tr = container.querySelector('tr');
        expect(tr.classList.contains('selected')).toBe(true);
      });

      it('does not have selected class when selection rowIdx differs from row position', () => {
        const { container } = renderRow({
          rowIdx: 1,
          selection: { rowIdx: 2, colIdx: 0, key: null },
        });
        const tr = container.querySelector('tr');
        expect(tr.classList.contains('selected')).toBe(false);
      });
    });
  });

  describe('SelectableTable', () => {
    function renderTable(props = {}) {
      return render(<SelectableTable {...tableProps} {...props} />);
    }

    describe('onTab', () => {
      it('shifts selection to the next row if last column is selected', () => {
        const onShiftSelection = jasmine.createSpy('onShiftSelection');
        // testDataSource has 3 columns (colLen=3), so colIdx=2 is the last column
        const { container } = renderTable({
          selection: { colIdx: 2, rowIdx: 1 },
          onShiftSelection,
        });
        // ListensToMovementKeys wraps the table in a KeyCommandsRegion div with onKeyDown
        const keyRegionDiv = container.firstElementChild as HTMLElement;
        fireEvent.keyDown(keyRegionDiv, { key: 'Tab', shiftKey: false });
        expect(onShiftSelection).toHaveBeenCalledWith({ row: 1, col: -2, key: 'Tab' });
      });

      it('shifts selection to the next col otherwise', () => {
        const onShiftSelection = jasmine.createSpy('onShiftSelection');
        const { container } = renderTable({
          selection: { colIdx: 0, rowIdx: 1 },
          onShiftSelection,
        });
        const keyRegionDiv = container.firstElementChild as HTMLElement;
        fireEvent.keyDown(keyRegionDiv, { key: 'Tab', shiftKey: false });
        expect(onShiftSelection).toHaveBeenCalledWith({ col: 1, key: 'Tab' });
      });
    });

    describe('onShiftTab', () => {
      it('shifts selection to the previous row if first column is selected', () => {
        const onShiftSelection = jasmine.createSpy('onShiftSelection');
        // colIdx=0 is the first column; testDataSource has 3 columns so col delta = colLen-1 = 2
        const { container } = renderTable({
          selection: { colIdx: 0, rowIdx: 2 },
          onShiftSelection,
        });
        const keyRegionDiv = container.firstElementChild as HTMLElement;
        fireEvent.keyDown(keyRegionDiv, { key: 'Tab', shiftKey: true });
        expect(onShiftSelection).toHaveBeenCalledWith({ row: -1, col: 2, key: 'Tab' });
      });

      it('shifts selection to the previous col otherwise', () => {
        const onShiftSelection = jasmine.createSpy('onShiftSelection');
        const { container } = renderTable({
          selection: { colIdx: 1, rowIdx: 1 },
          onShiftSelection,
        });
        const keyRegionDiv = container.firstElementChild as HTMLElement;
        fireEvent.keyDown(keyRegionDiv, { key: 'Tab', shiftKey: true });
        expect(onShiftSelection).toHaveBeenCalledWith({ col: -1, key: 'Tab' });
      });
    });

    it('renders custom RowRenderer components within the table', () => {
      let rowRendererCallCount = 0;
      const RowRenderer = (props: any) => {
        rowRendererCallCount += 1;
        return <tr data-testid="custom-row" />;
      };
      renderTable({ RowRenderer });
      expect(rowRendererCallCount).toBeGreaterThan(0);
    });

    it('renders custom CellRenderer components within the table', () => {
      let cellRendererCallCount = 0;
      const CellRenderer = (props: any) => {
        cellRendererCallCount += 1;
        return <td data-testid="custom-cell" />;
      };
      renderTable({ CellRenderer });
      expect(cellRendererCallCount).toBeGreaterThan(0);
    });

    it('passes selection and callbacks into extraProps for child renderers', () => {
      const capturedExtraProps: any[] = [];
      const onSetSelection = jasmine.createSpy('onSetSelection');
      const onShiftSelection = jasmine.createSpy('onShiftSelection');
      const extraProps = { p1: 'p1' };
      const RowRenderer = (props: any) => {
        capturedExtraProps.push(props);
        return <tr />;
      };
      renderTable({ extraProps, onSetSelection, onShiftSelection, RowRenderer });
      // The first captured props should include selection, onSetSelection, onShiftSelection, and p1
      const firstProps = capturedExtraProps[0];
      expect(firstProps.selection).toEqual(selection);
      expect(firstProps.onSetSelection).toBe(onSetSelection);
      expect(firstProps.onShiftSelection).toBe(onShiftSelection);
      expect(firstProps.p1).toBe('p1');
    });

    it('passes tableDataSource to the underlying table', () => {
      const capturedProps: any[] = [];
      const RowRenderer = (props: any) => {
        capturedProps.push(props);
        return <tr />;
      };
      renderTable({ RowRenderer });
      expect(capturedProps[0].tableDataSource).toBe(testDataSource);
    });
  });
});
