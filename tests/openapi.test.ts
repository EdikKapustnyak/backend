import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { generateOpenApiDocument } from '../src/openapi/generateDocument.js';

const app = createApp();

describe('generateOpenApiDocument', () => {
  it('produces a structurally valid OpenAPI 3.0 document', () => {
    const doc = generateOpenApiDocument();

    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info.title).toBeTruthy();
    expect(doc.paths).toBeTruthy();
  });

  it('registers a representative path from every module', () => {
    const doc = generateOpenApiDocument();
    const paths = Object.keys(doc.paths ?? {});

    // Not exhaustive - one path per module is enough to catch a whole
    // module's *.paths.ts file failing to load/register (e.g. a typo'd
    // import), without hardcoding every one of the ~45 registered paths.
    const expectedSamples = [
      '/auth/login',
      '/users',
      '/companies/me',
      '/billing/checkout',
      '/warehouses',
      '/products',
      '/inventory',
      '/suppliers',
      '/purchases',
      '/write-offs',
      '/stock-movements',
      '/inventarizations',
      '/notifications',
      '/reports/purchases/pdf',
      '/receipts',
      '/analytics/waste',
      '/local-events',
    ];

    for (const sample of expectedSamples) {
      expect(paths, `expected ${sample} to be registered`).toContain(sample);
    }
  });

  it('documents path-parameterized routes with the {id} placeholder', () => {
    const doc = generateOpenApiDocument();
    expect(Object.keys(doc.paths ?? {})).toContain('/warehouses/{id}');
  });

  it('registers the bearer auth security scheme', () => {
    const doc = generateOpenApiDocument();
    expect(doc.components?.securitySchemes?.['bearerAuth']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('marks public auth endpoints as not requiring security', () => {
    const doc = generateOpenApiDocument();
    const loginPath = doc.paths?.['/auth/login']?.post;
    expect(loginPath?.security).toEqual([]);
  });
});

describe('GET /docs/openapi.json', () => {
  it('serves the raw OpenAPI document as JSON', async () => {
    const res = await request(app).get('/docs/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.0');
    expect(res.body.paths['/warehouses']).toBeTruthy();
  });
});

describe('GET /docs', () => {
  it('serves the Swagger UI HTML page', async () => {
    const res = await request(app).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
  });
});
