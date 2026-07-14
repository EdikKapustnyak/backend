import type { Schema } from 'mongoose';
import { AppError } from '../errors/index.js';

/**
 * Converts "companyId always comes from the JWT, every tenant-scoped query
 * must include it" from a code-review convention (see the
 * "Tenant-scoped lookup" comments throughout every *.repository.ts file)
 * into something the framework itself refuses to skip. Apply with
 * `schema.plugin(tenantScopePlugin)` on every schema that has a
 * `companyId` field - see the bottom of each *.model.ts file in this
 * codebase for the actual wiring.
 *
 * WHAT THIS ENFORCES
 * - find / findOne / findOneAndUpdate / findOneAndDelete /
 *   findOneAndReplace / updateOne / updateMany / deleteOne / deleteMany /
 *   countDocuments: throws unless the query filter has a `companyId` key.
 *   (`findById`, `findByIdAndUpdate`, `findByIdAndDelete` are Mongoose
 *   sugar for `findOne`/`findOneAndUpdate`/`findOneAndDelete` under the
 *   hood, so they're covered automatically - no separate hook needed.)
 *   Registered as ten separate `schema.pre('<name>', ...)` calls rather
 *   than one `schema.pre([...names], ...)` - Mongoose's own TS types don't
 *   have an overload for an array of query-hook names, only individual
 *   literals (plus 'save'/'aggregate'/etc., each with a different `this`).
 * - save (i.e. every `Model.create(...)`, since nothing in this codebase
 *   calls `.save()` directly): throws unless the document being saved has
 *   `companyId` set. In practice this is a backstop, not the primary
 *   guard: every schema this plugin is applied to already marks
 *   `companyId` as `required: true`, so Mongoose's own validation already
 *   rejects a missing companyId before this hook would even run. It only
 *   matters if that changes (a future schema forgets `required: true`) or
 *   a caller explicitly bypasses validation (`{ validateBeforeSave:
 *   false }`) - see tenantScopePlugin.test.ts for how it's exercised.
 * - aggregate: throws unless at least one `$match` stage in the pipeline
 *   references `companyId` - see the caveat below.
 *
 * WHAT THIS DOES **NOT** DO - being honest about the limits
 * - It does NOT verify the companyId value is *correct*, only that one was
 *   provided. A bug that passes the wrong companyId still passes this
 *   check - this plugin only kills the "forgot to scope it at all" class
 *   of bug, which is the one that silently returns every tenant's data
 *   instead of none. Wrong-but-present values still need code review.
 * - It does NOT auto-inject companyId from request context. This codebase
 *   has no ambient/request-scoped state (no AsyncLocalStorage); every
 *   service function already receives companyId explicitly as a parameter
 *   (ultimately from `req.auth.companyId`), so this plugin only enforces
 *   that the value already being threaded through the call chain actually
 *   makes it into the query - it does not invent one out of thin air. An
 *   AsyncLocalStorage-based auto-injecting version is a possible future
 *   upgrade, not what this is.
 * - The aggregate check is a heuristic, not a guarantee: it scans every
 *   top-level `$match` stage for a `companyId` key, but can't verify a
 *   `$lookup`/`$facet`/`$unionWith` sub-pipeline is scoped correctly. It's
 *   verified correct for this codebase's three existing aggregations
 *   (purchase.repository.getTotalCompletedAmount, write-off.repository's
 *   getWasteByProduct/getWasteByReason), which all `$match` on companyId
 *   as their first stage.
 *
 * OPTING OUT
 * A handful of lookups are deliberately untenanted (global email
 * uniqueness checks, the refresh-token flow before a companyId is known,
 * invite-token lookups keyed by an unguessable token instead of a
 * company). Mark these explicitly with `.setOptions({ skipTenantScope:
 * true })` on the query - see user.repository.ts and invite.repository.ts
 * for every current case. An unmarked query is always assumed to be a
 * bug, never silently passed.
 */

function tenantViolation(modelName: string, detail: string): AppError {
  return new AppError(
    500,
    'INTERNAL_ERROR',
    `Tenant-scope violation: ${modelName} ${detail}. Pass companyId explicitly, ` +
      `or .setOptions({ skipTenantScope: true }) if this is a deliberately untenanted lookup.`,
  );
}

/**
 * Shared by all ten query-hook registrations below. Takes plain,
 * already-unwrapped values rather than the Mongoose Query itself, so it
 * has no dependency on exactly how each call site's `this` got typed -
 * each hook infers `this` on its own from Mongoose's per-literal overload
 * (see the file-level comment above for why this isn't one shared
 * `schema.pre([...names], fn)` call).
 */
function assertQueryHasCompanyId(
  filter: Record<string, unknown>,
  options: Record<string, unknown>,
  modelName: string,
  op: string,
): void {
  if (options['skipTenantScope']) return;
  if (!('companyId' in filter)) {
    throw tenantViolation(modelName, `query "${op}" has no companyId filter`);
  }
}

export function tenantScopePlugin(schema: Schema): void {
  schema.pre('find', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'find',
    );
  });

  schema.pre('findOne', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'findOne',
    );
  });

  schema.pre('findOneAndUpdate', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'findOneAndUpdate',
    );
  });

  schema.pre('findOneAndDelete', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'findOneAndDelete',
    );
  });

  schema.pre('findOneAndReplace', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'findOneAndReplace',
    );
  });

  schema.pre('updateOne', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'updateOne',
    );
  });

  schema.pre('updateMany', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'updateMany',
    );
  });

  schema.pre('deleteOne', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'deleteOne',
    );
  });

  schema.pre('deleteMany', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'deleteMany',
    );
  });

  schema.pre('countDocuments', async function () {
    assertQueryHasCompanyId(
      this.getFilter() as unknown as Record<string, unknown>,
      this.getOptions() as unknown as Record<string, unknown>,
      this.model.modelName,
      'countDocuments',
    );
  });

  schema.pre('save', async function () {
    if (!this.get('companyId')) {
      throw tenantViolation(this.collection.collectionName, 'was saved without companyId set');
    }
  });

  schema.pre('aggregate', async function () {
    const hasCompanyIdMatch = this.pipeline().some((stage) => {
      const match = (stage as unknown as Record<string, unknown>)['$match'];
      return match !== null && typeof match === 'object' && 'companyId' in match;
    });

    if (!hasCompanyIdMatch) {
      throw new AppError(
        500,
        'INTERNAL_ERROR',
        'Tenant-scope violation: an aggregate pipeline has no $match stage referencing companyId. ' +
          'Add one, or move the query out of a tenant-scoped model if it genuinely spans every company.',
      );
    }
  });
}
