import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildImportTemplate } from './import.template.js';
import { previewImportWorkbook } from './import.mapping.service.js';
import { importFromXlsxWithMapping } from './import.service.js';
import { importMappingInputSchema } from './import.schema.js';
import { UnauthorizedError, BadRequestError, ValidationAppError } from '../../errors/index.js';

export const downloadImportTemplate = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const buffer = buildImportTemplate();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', 'attachment; filename="axis-digital-import-template.xlsx"');
  res.send(buffer);
});

/**
 * Step 1 of 2 - reads the uploaded file's sheets/headers and asks Claude
 * to suggest which entity each sheet is and how its columns map to our
 * fields. Never writes anything. The client shows this to the user for
 * review/editing, then re-uploads the same file to POST /import/xlsx
 * along with the confirmed mapping.
 */
export const previewImportXlsx = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  if (!req.file) throw new BadRequestError('A "file" upload is required');

  const preview = await previewImportWorkbook(req.file.buffer);
  sendSuccess(res, preview);
});

/**
 * Step 2 of 2 - actually imports, using the mapping the user confirmed
 * (or edited) after reviewing the preview. `mapping` arrives as a JSON
 * string in a regular multipart text field alongside the file, since
 * multipart/form-data has no native nested-object field type.
 */
export const importXlsx = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  if (!req.file) throw new BadRequestError('A "file" upload is required');

  const rawMapping = req.body?.mapping;
  if (typeof rawMapping !== 'string') {
    throw new BadRequestError('A "mapping" field (JSON string) is required alongside the file');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawMapping);
  } catch {
    throw new BadRequestError('"mapping" was not valid JSON');
  }

  const mappingResult = importMappingInputSchema.safeParse(parsedJson);
  if (!mappingResult.success) {
    throw new ValidationAppError('Validation failed', mappingResult.error.flatten());
  }

  const report = await importFromXlsxWithMapping(req.auth.companyId, req.file.buffer, mappingResult.data);
  sendSuccess(res, report, 'Import complete');
});
