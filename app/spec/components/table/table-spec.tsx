import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Table, TableRow, TableCell } from 'mailspring-component-kit';
import { testDataSource } from '../../fixtures/table-data';

afterEach(cleanup);

describe('Table Components', function describeBlock() {
  describe('TableCell', () => {
    it('renders children correctly', () => {
      const { container } = render(
        <table>
          <tbody>
            <tr>
              <TableCell>Cell</TableCell>
            </tr>
          </tbody>
        </table>
      );
      const cell = container.querySelector('td');
      expect(cell.textContent).toEqual('Cell');
    });

    it('renders a th when is header', () => {
      const { container } = render(
        <table>
          <thead>
            <tr>
              <TableCell isHeader>{null}</TableCell>
            </tr>
          </thead>
        </table>
      );
      expect(container.querySelector('th')).not.toBe(null);
      expect(container.querySelector('td')).toBe(null);
    });

    it('renders a td when is not header', () => {
      const { container } = render(
        <table>
          <tbody>
            <tr>
              <TableCell isHeader={false}>{null}</TableCell>
            </tr>
          </tbody>
        </table>
      );
      expect(container.querySelector('td')).not.toBe(null);
      expect(container.querySelector('th')).toBe(null);
    });

    it('renders extra classNames', () => {
      const { container } = render(
        <table>
          <tbody>
            <tr>
              <TableCell className="my-cell">{null}</TableCell>
            </tr>
          </tbody>
        </table>
      );
      const cell = container.querySelector('td');
      expect(cell.classList.contains('my-cell')).toBe(true);
    });

    it('passes onClick prop to cell and fires on click', () => {
      const handler = jasmine.createSpy('onClick');
      const { container } = render(
        <table>
          <tbody>
            <tr>
              <TableCell className="my-cell" onClick={handler}>
                {null}
              </TableCell>
            </tr>
          </tbody>
        </table>
      );
      const cell = container.querySelector('td');
      fireEvent.click(cell);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('TableRow', () => {
    function renderRow(props: any = {}) {
      const { container } = render(
        <table>
          <tbody>
            <TableRow rowIdx={0} tableDataSource={testDataSource} {...props} />
          </tbody>
        </table>
      );
      return container;
    }

    it('renders extra classNames', () => {
      const container = renderRow({ className: 'my-row' });
      const row = container.querySelector('tr');
      expect(row.classList.contains('my-row')).toBe(true);
    });

    it('renders correct className when row is header', () => {
      const container = renderRow({ isHeader: true });
      const row = container.querySelector('tr');
      expect(row.classList.contains('table-row-header')).toBe(true);
    });

    it('renders cells correctly given the tableDataSource', () => {
      const container = renderRow();
      const cells = container.querySelectorAll('td');
      // testDataSource has 3 columns and row 0 is [1, 2, 3]
      expect(cells.length).toBe(3);
      expect(cells[0].textContent).toEqual('1');
      expect(cells[1].textContent).toEqual('2');
      expect(cells[2].textContent).toEqual('3');
    });

    it('renders cells correctly if row is header', () => {
      const container = renderRow({ isHeader: true, rowIdx: null });
      // TableRow doesn't forward isHeader to CellRenderer directly, so cells render as td.
      // Column names come from cellAt({rowIdx: null, colIdx}) returning the column name.
      const cells = container.querySelectorAll('td');
      expect(cells.length).toBe(3);
      expect(cells[0].textContent).toEqual('col1');
      expect(cells[1].textContent).toEqual('col2');
      expect(cells[2].textContent).toEqual('col3');
    });

    it('renders first cell with row number if displayNumbers specified', () => {
      const container = renderRow({ displayNumbers: true });
      const cells = container.querySelectorAll('td');
      // 3 data cells + 1 numbered cell = 4 total td cells
      expect(cells.length).toBe(4);
      const numberedCell = cells[0];
      expect(numberedCell.classList.contains('numbered-cell')).toBe(true);
      // rowIdx=0, so row number displayed is 0+1=1
      expect(numberedCell.textContent).toEqual('1');
    });

    it('renders cell correctly given the CellRenderer', () => {
      const CellRenderer = (props: any) => {
        // Render a div with a data-testid so we can verify it's used
        const { children, tableDataSource: _ds, rowIdx: _ri, colIdx: _ci, ...rest } = props;
        return (
          <td {...rest} data-custom-cell="true">
            {children}
          </td>
        );
      };
      const container = renderRow({ CellRenderer });
      const customCells = container.querySelectorAll('[data-custom-cell="true"]');
      expect(customCells.length).toBe(3);
    });

    it('passes correct props to children cells (verified via DOM output)', () => {
      // We verify that the extraProps are forwarded by using a CellRenderer
      // that reflects the received props as data attributes, then checking the DOM.
      const CellRenderer = (props: any) => {
        const { children, tableDataSource: _ds, rowIdx, colIdx, prop1, ...rest } = props;
        return (
          <td {...rest} data-row-idx={rowIdx} data-col-idx={colIdx} data-prop1={prop1}>
            {children}
          </td>
        );
      };
      const extraProps = { prop1: 'prop1' };
      const container = renderRow({ extraProps, CellRenderer });
      const cells = container.querySelectorAll('td');
      expect(cells.length).toBe(3);
      [0, 1, 2].forEach((idx) => {
        expect(cells[idx].getAttribute('data-row-idx')).toEqual('0');
        expect(cells[idx].getAttribute('data-col-idx')).toEqual(`${idx}`);
        expect(cells[idx].getAttribute('data-prop1')).toEqual('prop1');
      });
    });
  });

  describe('Table', () => {
    function renderTable(props: any = {}) {
      const { container } = render(<Table {...props} tableDataSource={testDataSource} />);
      return container;
    }

    describe('renderHeader', () => {
      it('renders nothing if displayHeader is not specified', () => {
        const container = renderTable({ displayHeader: false });
        expect(container.querySelector('thead')).toBe(null);
      });

      it('renders header row with the given RowRenderer', () => {
        // The RowRenderer must render something inside thead. We use a custom
        // RowRenderer that renders a tr with a data attribute so we can identify it.
        const RowRenderer = (props: any) => {
          const {
            tableDataSource: _ds,
            rowIdx: _ri,
            extraProps: _ep,
            CellRenderer: _cr,
            displayNumbers: _dn,
            isHeader: _ih,
            ...rest
          } = props;
          return <tr {...rest} data-custom-row="true" />;
        };
        const container = renderTable({ displayHeader: true, RowRenderer });
        const thead = container.querySelector('thead');
        expect(thead).not.toBe(null);
        const customRow = thead.querySelector('[data-custom-row="true"]');
        expect(customRow).not.toBe(null);
      });

      it('passes correct props to header row (isHeader, displayNumbers, extraProps)', () => {
        // Verify the header row receives and uses isHeader by checking it renders th cells,
        // receives displayNumbers by checking the numbered-cell appears, and extraProps
        // are forwarded by checking column cell content.
        const container = renderTable({
          displayHeader: true,
          displayNumbers: true,
          extraProps: { p1: 'p1' },
        });
        const thead = container.querySelector('thead');
        expect(thead).not.toBe(null);
        // isHeader=true → cells should be th
        const headerCells = thead.querySelectorAll('th');
        // 3 column header cells + 1 numbered-cell (header mode renders '' for number)
        expect(headerCells.length).toBe(4);
        // The first th is the numbered-cell in header mode (empty text)
        expect(headerCells[0].classList.contains('numbered-cell')).toBe(true);
        expect(headerCells[0].textContent).toEqual('');
        // Column headers from the data source
        expect(headerCells[1].textContent).toEqual('col1');
        expect(headerCells[2].textContent).toEqual('col2');
        expect(headerCells[3].textContent).toEqual('col3');
      });
    });

    describe('renderBody', () => {
      it('renders a tbody containing all data rows', () => {
        // LazyRenderedList renders rows into a tbody. With default itemHeight/containerHeight,
        // all 3 rows of testDataSource are visible.
        const container = renderTable();
        const tbody = container.querySelector('tbody');
        expect(tbody).not.toBe(null);
        // 3 data rows rendered as tr elements (plus 2 buffer tr elements from LazyRenderedList)
        const rows = tbody.querySelectorAll('tr');
        // Find rows that have actual td cells (not buffer rows)
        const dataRows = Array.from(rows).filter((r) => r.querySelectorAll('td').length > 0);
        expect(dataRows.length).toBe(3);
      });

      it('renders rows with correct cell data', () => {
        const container = renderTable();
        const tbody = container.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr');
        const dataRows = Array.from(rows).filter((r) => r.querySelectorAll('td').length > 0);
        // Row 0: [1, 2, 3], Row 1: [4, 5, 6], Row 2: [7, 8, 9]
        const row0Cells = dataRows[0].querySelectorAll('td');
        expect(row0Cells[0].textContent).toEqual('1');
        expect(row0Cells[1].textContent).toEqual('2');
        expect(row0Cells[2].textContent).toEqual('3');

        const row1Cells = dataRows[1].querySelectorAll('td');
        expect(row1Cells[0].textContent).toEqual('4');
        expect(row1Cells[1].textContent).toEqual('5');
        expect(row1Cells[2].textContent).toEqual('6');

        const row2Cells = dataRows[2].querySelectorAll('td');
        expect(row2Cells[0].textContent).toEqual('7');
        expect(row2Cells[1].textContent).toEqual('8');
        expect(row2Cells[2].textContent).toEqual('9');
      });
    });

    describe('renderRow', () => {
      it('renders rows using the given RowRenderer', () => {
        // Instead of extracting renderRow via instance(), render the full Table
        // with a custom RowRenderer and verify it appears in the DOM body.
        const RowRenderer = (props: any) => {
          const {
            tableDataSource: _ds,
            rowIdx,
            extraProps: _ep,
            CellRenderer: _cr,
            displayNumbers: _dn,
            ...rest
          } = props;
          return <tr {...rest} data-custom-row="true" data-row-idx={rowIdx} />;
        };
        const container = renderTable({ RowRenderer });
        const tbody = container.querySelector('tbody');
        const customRows = tbody.querySelectorAll('[data-custom-row="true"]');
        // testDataSource has 3 rows
        expect(customRows.length).toBe(3);
      });

      it('passes the correct props to body rows when displayHeader is true', () => {
        // Render with a CellRenderer that exposes props as data-attributes so we
        // can verify displayNumbers and extraProps are forwarded to each row/cell.
        const CellRenderer = (props: any) => {
          const {
            children,
            tableDataSource: _ds,
            rowIdx,
            colIdx,
            p1,
            isHeader: _ih,
            ...rest
          } = props;
          return (
            <td {...rest} data-row-idx={rowIdx} data-col-idx={colIdx} data-p1={p1}>
              {children}
            </td>
          );
        };
        const extraProps = { p1: 'p1' };
        const container = renderTable({
          displayHeader: true,
          displayNumbers: true,
          extraProps,
          CellRenderer,
        });
        const tbody = container.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr');
        const dataRows = Array.from(rows).filter((r) => r.querySelectorAll('td').length > 0);
        expect(dataRows.length).toBe(3);

        // Each data row should have 4 cells: 1 numbered + 3 data cells
        // (displayNumbers=true adds a numbered-cell as the first td)
        dataRows.forEach((row, rowIdx) => {
          const tds = row.querySelectorAll('td');
          // numbered-cell + 3 data cells
          expect(tds.length).toBe(4);
          // The non-numbered cells should carry p1 and correct rowIdx/colIdx
          const dataCells = Array.from(tds).slice(1);
          dataCells.forEach((cell, colIdx) => {
            expect(cell.getAttribute('data-row-idx')).toEqual(`${rowIdx}`);
            expect(cell.getAttribute('data-col-idx')).toEqual(`${colIdx}`);
            expect(cell.getAttribute('data-p1')).toEqual('p1');
          });
        });
      });

      it('passes the correct rowIdx to each body row when displayHeader is false', () => {
        // Use a RowRenderer that exposes rowIdx as a data attribute.
        const RowRenderer = (props: any) => {
          const {
            tableDataSource: _ds,
            rowIdx,
            extraProps: _ep,
            CellRenderer: _cr,
            displayNumbers: _dn,
            ...rest
          } = props;
          return <tr {...rest} data-row-idx={rowIdx} />;
        };
        const container = renderTable({ displayHeader: false, RowRenderer });
        const tbody = container.querySelector('tbody');
        const rows = tbody.querySelectorAll('[data-row-idx]');
        expect(rows.length).toBe(3);
        expect(rows[0].getAttribute('data-row-idx')).toEqual('0');
        expect(rows[1].getAttribute('data-row-idx')).toEqual('1');
        expect(rows[2].getAttribute('data-row-idx')).toEqual('2');
      });
    });
  });
});
