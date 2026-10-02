import fs from 'fs';
import { localized } from 'mailspring-exports';

/**
 * Quotes the cell and defuses spreadsheet formula injection: names and subjects
 * come from received mail, so a leading `=`, `+`, `-`, `@` or tab would
 * otherwise execute when the export is opened in Excel.
 */
export function csvCell(value: unknown) {
  let text = value == null ? '' : `${value}`;
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

export function csvLine(cells: unknown[]) {
  return cells.map(csvCell).join(',') + '\n';
}

/**
 * Prompts for a destination and streams CSV rows to it. `writeRows` receives a
 * `write` callback that resolves once the line has been flushed, so callers can
 * produce rows lazily from chunked database queries.
 */
export function exportCsv(
  defaultPath: string,
  header: string[],
  writeRows: (write: (cells: unknown[]) => Promise<void>) => Promise<void>
) {
  AppEnv.showSaveDialog({ defaultPath }, async (filepath: string) => {
    if (!filepath) {
      return;
    }
    const ws = fs.createWriteStream(filepath);
    ws.on('error', (err) => {
      AppEnv.showErrorDialog({
        title: localized('Export Failed'),
        message: localized(
          `Mailspring was unable to write to the file location you specified (%@).` +
            `Try choosing another location.\n\n%@`,
          filepath,
          err.toString()
        ),
      });
    });

    ws.write(csvLine(header));
    await writeRows(
      (cells) => new Promise<void>((resolve) => ws.write(csvLine(cells), () => resolve()))
    );
    ws.end();
  });
}
