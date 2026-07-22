import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { createApp } from '../src/app.js';
import { anthropicClient } from '../src/utils/anthropicClient.js';
import {
  WAREHOUSE_SHEET_NAME,
  WAREHOUSE_COLUMNS,
  SUPPLIER_SHEET_NAME,
  SUPPLIER_COLUMNS,
  PRODUCT_SHEET_NAME,
  PRODUCT_COLUMNS,
  type ImportColumn,
} from '../src/modules/imports/import.columns.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

async function registerCompany(email: string, companyName: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/register-company').send({
    companyName,
    city: 'Stavanger',
    ownerName: 'Owner',
    email,
    password: strongPassword,
  });
  return res.body.data.accessToken as string;
}

async function inviteEmployee(ownerToken: string, email: string): Promise<string> {
  const invite = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Employee', email, role: 'employee' });
  const token = new URL(invite.body.data.inviteLink as string).searchParams.get('token');
  const accept = await request(app)
    .post('/api/v1/auth/accept-invite')
    .send({ token, password: strongPassword });
  return accept.body.data.accessToken as string;
}

/** Builds a real .xlsx buffer with the given sheets - `sheets` maps sheet name to an array-of-arrays (first row = headers). Mirrors what a real upload looks like. */
function buildWorkbook(sheets: Record<string, (string | number)[][]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** field -> header, 1:1 from our own column defs - the "no remapping needed" case. */
function identityMapping(columns: ImportColumn[]): Record<string, string> {
  return Object.fromEntries(columns.map((c) => [c.field, c.header]));
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function attachXlsx(req: request.Test, buffer: Buffer): request.Test {
  return req.attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });
}

const warehouseHeaders = WAREHOUSE_COLUMNS.map((c) => c.header);
const supplierHeaders = SUPPLIER_COLUMNS.map((c) => c.header);
const productHeaders = PRODUCT_COLUMNS.map((c) => c.header);

let askClaudeForJsonSpy: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  askClaudeForJsonSpy?.mockRestore();
});

describe('GET /api/v1/import/template', () => {
  it('downloads a workbook with the three expected sheets and headers', async () => {
    const ownerToken = await registerCompany('owner1@imp.test', 'Import Co 1');

    const res = await request(app)
      .get('/api/v1/import/template')
      .set('Authorization', `Bearer ${ownerToken}`)
      .buffer()
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status, JSON.stringify(res.headers)).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).slice(0, 2).toString()).toBe('PK');

    const workbook = XLSX.read(res.body as Buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual([WAREHOUSE_SHEET_NAME, SUPPLIER_SHEET_NAME, PRODUCT_SHEET_NAME]);

    const warehouseRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[WAREHOUSE_SHEET_NAME]!, {
      header: 1,
    });
    expect(warehouseRows[0]).toEqual(warehouseHeaders);
  });

  it('rejects an employee (same roles as create endpoints)', async () => {
    const ownerToken = await registerCompany('owner2@imp.test', 'Import Co 2');
    const employeeToken = await inviteEmployee(ownerToken, 'employee2@imp.test');

    const res = await request(app)
      .get('/api/v1/import/template')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/import/xlsx/preview', () => {
  it('suggests an entity type and column mapping for a sheet with non-template headers', async () => {
    const ownerToken = await registerCompany('owner3@imp.test', 'Import Co 3');

    askClaudeForJsonSpy = vi.spyOn(anthropicClient, 'askClaudeForJson').mockResolvedValue({
      entityType: 'product',
      mapping: {
        name: 'Item Name',
        sku: 'Code',
        category: null,
        purchasePrice: 'Cost',
        salePrice: 'Price',
        unit: null,
        minStockLevel: null,
        barcode: null,
      },
    });

    const buffer = buildWorkbook({
      Inventory: [
        ['Item Name', 'Code', 'Cost', 'Price'],
        ['Widget', 'W-1', 5, 9.5],
      ],
    });

    const res = await request(app)
      .post('/api/v1/import/xlsx/preview')
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', buffer, { filename: 'inventory.xlsx', contentType: XLSX_MIME });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.sheets).toHaveLength(1);
    const sheet = res.body.data.sheets[0];
    expect(sheet.sheetName).toBe('Inventory');
    expect(sheet.headers).toEqual(['Item Name', 'Code', 'Cost', 'Price']);
    expect(sheet.suggestedEntityType).toBe('product');
    expect(sheet.suggestedMapping.sku).toBe('Code');
    expect(askClaudeForJsonSpy).toHaveBeenCalledTimes(1);
  });

  it('degrades gracefully (no suggestion) if the AI call fails, without failing the request', async () => {
    const ownerToken = await registerCompany('owner4@imp.test', 'Import Co 4');
    askClaudeForJsonSpy = vi.spyOn(anthropicClient, 'askClaudeForJson').mockRejectedValue(new Error('down'));

    const buffer = buildWorkbook({ Sheet1: [['A', 'B'], ['x', 'y']] });

    const res = await attachXlsx(
      request(app).post('/api/v1/import/xlsx/preview').set('Authorization', `Bearer ${ownerToken}`),
      buffer,
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.sheets[0].suggestedEntityType).toBeNull();
    expect(res.body.data.sheets[0].suggestedMapping).toEqual({});
  });

  it('rejects an employee (same roles as create endpoints)', async () => {
    const ownerToken = await registerCompany('owner5@imp.test', 'Import Co 5');
    const employeeToken = await inviteEmployee(ownerToken, 'employee5@imp.test');
    const buffer = buildWorkbook({ Sheet1: [['A'], ['x']] });

    const res = await attachXlsx(
      request(app).post('/api/v1/import/xlsx/preview').set('Authorization', `Bearer ${employeeToken}`),
      buffer,
    );

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/import/xlsx', () => {
  it('imports valid rows across all three sheets using the template mapping (1:1, no remapping needed)', async () => {
    const ownerToken = await registerCompany('owner6@imp.test', 'Import Co 6');

    const buffer = buildWorkbook({
      [WAREHOUSE_SHEET_NAME]: [warehouseHeaders, ['Главный склад', 'ул. Ленина, 1']],
      [SUPPLIER_SHEET_NAME]: [
        supplierHeaders,
        ['Кофе-Трейд', 'Иван Иванов', '+7 900 000-00-00', 'sales@coffee.test', 'Москва', 'Заметка'],
      ],
      [PRODUCT_SHEET_NAME]: [
        productHeaders,
        ['Кофе Arabica', 'SKU-IMP-1', 'Кофе', 650, 990, 'шт', 10, '4600000000001'],
      ],
    });

    const mapping = {
      sheets: [
        { sheetName: WAREHOUSE_SHEET_NAME, entityType: 'warehouse', columnMapping: identityMapping(WAREHOUSE_COLUMNS) },
        { sheetName: SUPPLIER_SHEET_NAME, entityType: 'supplier', columnMapping: identityMapping(SUPPLIER_COLUMNS) },
        { sheetName: PRODUCT_SHEET_NAME, entityType: 'product', columnMapping: identityMapping(PRODUCT_COLUMNS) },
      ],
    };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.warehouses).toEqual({ createdCount: 1, errors: [] });
    expect(res.body.data.suppliers).toEqual({ createdCount: 1, errors: [] });
    expect(res.body.data.products.createdCount).toBe(1);
    expect(res.body.data.products.errors).toEqual([]);

    const productsList = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(productsList.body.data.items).toHaveLength(1);
    expect(productsList.body.data.items[0].sku).toBe('SKU-IMP-1');
  });

  it('imports a sheet with completely different headers and order via a custom mapping', async () => {
    const ownerToken = await registerCompany('owner7@imp.test', 'Import Co 7');

    // Deliberately not our template at all: different sheet name, different
    // header text, different column order (SKU before name).
    const buffer = buildWorkbook({
      'My Inventory': [
        ['Code', 'Item Name', 'Cost Price', 'Sell Price'],
        ['SKU-CUSTOM-1', 'Custom Widget', 12.5, 24.99],
      ],
    });

    const mapping = {
      sheets: [
        {
          sheetName: 'My Inventory',
          entityType: 'product',
          columnMapping: {
            name: 'Item Name',
            sku: 'Code',
            purchasePrice: 'Cost Price',
            salePrice: 'Sell Price',
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, { filename: 'my-inventory.xlsx', contentType: XLSX_MIME });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.products.createdCount).toBe(1);
    expect(res.body.data.products.errors).toEqual([]);

    const productsList = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(productsList.body.data.items[0].sku).toBe('SKU-CUSTOM-1');
    expect(productsList.body.data.items[0].purchasePrice).toBe(12.5);
  });

  it('skips invalid rows and reports them, without aborting valid ones', async () => {
    const ownerToken = await registerCompany('owner8@imp.test', 'Import Co 8');

    const buffer = buildWorkbook({
      [PRODUCT_SHEET_NAME]: [
        productHeaders,
        ['Товар ОК', 'SKU-OK', 'Кат', 100, 150, 'шт', 5, ''],
        // Missing required SKU (row 3) - should be skipped, not abort the batch.
        ['Товар без SKU', '', 'Кат', 100, 150, 'шт', 5, ''],
      ],
    });

    const mapping = {
      sheets: [{ sheetName: PRODUCT_SHEET_NAME, entityType: 'product', columnMapping: identityMapping(PRODUCT_COLUMNS) }],
    };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.products.createdCount).toBe(1);
    expect(res.body.data.products.errors).toHaveLength(1);
    expect(res.body.data.products.errors[0].row).toBe(3);
  });

  it('reports a clear error for a duplicate SKU, without aborting the rest', async () => {
    const ownerToken = await registerCompany('owner9@imp.test', 'Import Co 9');
    await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Existing', sku: 'DUP-SKU', purchasePrice: 1, salePrice: 2 });

    const buffer = buildWorkbook({
      [PRODUCT_SHEET_NAME]: [
        productHeaders,
        ['Дубликат', 'DUP-SKU', '', 1, 2, '', '', ''],
        ['Новый товар', 'FRESH-SKU', '', 1, 2, '', '', ''],
      ],
    });
    const mapping = {
      sheets: [{ sheetName: PRODUCT_SHEET_NAME, entityType: 'product', columnMapping: identityMapping(PRODUCT_COLUMNS) }],
    };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });

    expect(res.body.data.products.createdCount).toBe(1);
    expect(res.body.data.products.errors).toHaveLength(1);
    expect(res.body.data.products.errors[0].message).toMatch(/already exists/i);
  });

  it('enforces the plan warehouse limit per row (Basic: 1)', async () => {
    const ownerToken = await registerCompany('owner10@imp.test', 'Import Co 10');

    const buffer = buildWorkbook({
      [WAREHOUSE_SHEET_NAME]: [warehouseHeaders, ['Склад 1', ''], ['Склад 2', '']],
    });
    const mapping = {
      sheets: [{ sheetName: WAREHOUSE_SHEET_NAME, entityType: 'warehouse', columnMapping: identityMapping(WAREHOUSE_COLUMNS) }],
    };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });

    expect(res.body.data.warehouses.createdCount).toBe(1);
    expect(res.body.data.warehouses.errors).toHaveLength(1);
    expect(res.body.data.warehouses.errors[0].message).toMatch(/plan allows up to/i);
  });

  it('reports a clear per-entity error when a mapped sheet name is not actually in the file', async () => {
    const ownerToken = await registerCompany('owner11@imp.test', 'Import Co 11');

    const buffer = buildWorkbook({
      [PRODUCT_SHEET_NAME]: [productHeaders, ['Товар', 'SKU-1', '', 1, 2, '', '', '']],
    });
    const mapping = {
      sheets: [
        { sheetName: PRODUCT_SHEET_NAME, entityType: 'product', columnMapping: identityMapping(PRODUCT_COLUMNS) },
        // This sheet doesn't exist in the uploaded file.
        { sheetName: 'Nonexistent Sheet', entityType: 'warehouse', columnMapping: identityMapping(WAREHOUSE_COLUMNS) },
      ],
    };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.products.createdCount).toBe(1);
    expect(res.body.data.warehouses.createdCount).toBe(0);
    expect(res.body.data.warehouses.errors[0].message).toMatch(/not found/i);
  });

  it('rejects a non-xlsx file', async () => {
    const ownerToken = await registerCompany('owner12@imp.test', 'Import Co 12');
    const mapping = { sheets: [{ sheetName: PRODUCT_SHEET_NAME, entityType: 'product', columnMapping: identityMapping(PRODUCT_COLUMNS) }] };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', Buffer.from('not an excel file'), { filename: 'import.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
  });

  it('rejects a request with no mapping field', async () => {
    const ownerToken = await registerCompany('owner13@imp.test', 'Import Co 13');
    const buffer = buildWorkbook({ [PRODUCT_SHEET_NAME]: [productHeaders] });

    const res = await attachXlsx(
      request(app).post('/api/v1/import/xlsx').set('Authorization', `Bearer ${ownerToken}`),
      buffer,
    );

    expect(res.status).toBe(400);
  });

  it('rejects malformed mapping JSON', async () => {
    const ownerToken = await registerCompany('owner14@imp.test', 'Import Co 14');
    const buffer = buildWorkbook({ [PRODUCT_SHEET_NAME]: [productHeaders] });

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', '{not valid json')
      .attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });

    expect(res.status).toBe(400);
  });

  it('rejects a mapping with an invalid entityType', async () => {
    const ownerToken = await registerCompany('owner15@imp.test', 'Import Co 15');
    const buffer = buildWorkbook({ [PRODUCT_SHEET_NAME]: [productHeaders] });
    const mapping = { sheets: [{ sheetName: PRODUCT_SHEET_NAME, entityType: 'not-a-real-type', columnMapping: {} }] };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });

    expect(res.status).toBe(422);
  });

  it('rejects an employee (same roles as create endpoints)', async () => {
    const ownerToken = await registerCompany('owner16@imp.test', 'Import Co 16');
    const employeeToken = await inviteEmployee(ownerToken, 'employee16@imp.test');
    const buffer = buildWorkbook({ [PRODUCT_SHEET_NAME]: [productHeaders] });
    const mapping = { sheets: [{ sheetName: PRODUCT_SHEET_NAME, entityType: 'product', columnMapping: identityMapping(PRODUCT_COLUMNS) }] };

    const res = await request(app)
      .post('/api/v1/import/xlsx')
      .set('Authorization', `Bearer ${employeeToken}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', buffer, { filename: 'import.xlsx', contentType: XLSX_MIME });

    expect(res.status).toBe(403);
  });
});
