import { Task } from './task';
import * as Attributes from '../attributes';
import { AttributeValues } from '../models/model';

export interface ExportResult {
  total?: number;
  exported?: number;
  failed?: number;
  outputDir?: string;
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
    result: Attributes.Obj({
      modelKey: 'result',
    }),
  };

  folderId: string;
  folderPath: string;
  outputDir: string;
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
    return 'Exporting folder as .eml files';
  }
}
