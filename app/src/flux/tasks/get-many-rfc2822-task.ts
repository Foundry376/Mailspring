import { Task } from './task';
import * as Attributes from '../attributes';
import { AttributeValues } from '../models/model';

export interface ExportResult {
  total?: number;
  exported?: number;
  failed?: number;
  outputDir?: string;
  // Set by the sync engine when the export stopped on a cancel request. The
  // task's status still ends up "complete" in that case (performRemote only
  // maps shouldCancel to the cancelled status before the export starts), so
  // consumers must check this flag to distinguish a cancelled export.
  cancelled?: boolean;
  errors?: Array<{ messageId: string; subject: string; error: string }>;
}

export class GetManyRFC2822Task extends Task {
  static attributes = {
    ...Task.attributes,

    folderId: Attributes.String({
      modelKey: 'folderId',
    }),
    folderPath: Attributes.String({
      modelKey: 'folderPath',
    }),
    outputDir: Attributes.String({
      modelKey: 'outputDir',
    }),
    // 'eml' (default) or 'mbox'. Only read by the client — the sync engine
    // always writes individual .eml files to outputDir, and for mbox exports
    // the client incrementally assembles them into mboxPath as the export
    // progresses (see mbox-export-runner in the account-sidebar package).
    format: Attributes.String({
      modelKey: 'format',
    }),
    mboxPath: Attributes.String({
      modelKey: 'mboxPath',
    }),
    progress: Attributes.Obj({
      modelKey: 'progress',
    }),
    result: Attributes.Obj({
      modelKey: 'result',
    }),
  };

  folderId: string;
  folderPath: string;
  outputDir: string;
  format: 'eml' | 'mbox';
  mboxPath: string;
  progress: ExportResult;
  result: ExportResult;

  constructor(data: AttributeValues<typeof GetManyRFC2822Task.attributes> = {}) {
    super(data);
  }

  label() {
    if (this.result && this.result.total) {
      const { exported, total, failed } = this.result;
      if (failed > 0) {
        return `Exporting ${exported || 0} / ${total} (${failed} failed)`;
      }
      return `Exporting ${exported || 0} / ${total}`;
    }
    return this.format === 'mbox' ? 'Exporting folder as mbox' : 'Exporting folder as .eml files';
  }
}
