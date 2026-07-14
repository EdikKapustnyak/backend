import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { ProductModel } from '../src/modules/products/product.model.js';

/**
 * Exercises tenantScopePlugin.ts directly against a real, already-wired
 * model (Product) rather than a synthetic throwaway schema - this is
 * exactly the plugin wiring every other test file in this codebase relies
 * on implicitly, so testing it directly here (unlike every other test
 * file, which goes through the HTTP API layer) is testing the mechanism
 * itself, not a business feature built on top of it.
 */
describe('tenantScopePlugin', () => {
  const companyId = new Types.ObjectId().toString();

  const validProductInput = {
    companyId,
    name: 'Test Product',
    sku: 'TENANT-TEST-SKU',
    purchasePrice: 10,
    salePrice: 20,
  };

  describe('query hooks (find/findOne/findById/countDocuments/etc.)', () => {
    it('rejects a find() with no companyId in the filter', async () => {
      await expect(ProductModel.find({ name: 'anything' }).exec()).rejects.toThrow(
        /Tenant-scope violation/,
      );
    });

    it('allows a find() that includes companyId', async () => {
      await expect(ProductModel.find({ companyId }).exec()).resolves.toEqual([]);
    });

    it('rejects findById() (sugar for findOne) with no companyId', async () => {
      // findById translates to findOne({_id}) under the hood - this proves
      // the findOne hook actually covers it, not just literal findOne() calls.
      await expect(ProductModel.findById(new Types.ObjectId()).exec()).rejects.toThrow(
        /Tenant-scope violation/,
      );
    });

    it('rejects countDocuments() with no companyId', async () => {
      await expect(ProductModel.countDocuments({}).exec()).rejects.toThrow(
        /Tenant-scope violation/,
      );
    });

    it('allows countDocuments() that includes companyId', async () => {
      await expect(ProductModel.countDocuments({ companyId }).exec()).resolves.toBe(0);
    });

    it('lets .setOptions({ skipTenantScope: true }) bypass the check', async () => {
      await expect(
        ProductModel.find({ name: 'anything' }).setOptions({ skipTenantScope: true }).exec(),
      ).resolves.toEqual([]);
    });
  });

  describe('save hook (Model.create)', () => {
    it('allows creating a document that includes companyId', async () => {
      const created = await ProductModel.create(validProductInput);
      expect(created.companyId.toString()).toBe(companyId);
    });

    it('blocks a save with no companyId even when schema validation is bypassed', async () => {
      // companyId is already `required: true` on every schema this plugin
      // is applied to, so Mongoose's own validation normally catches a
      // missing companyId before this hook would ever run - that's the
      // primary guard. This test forces `validateBeforeSave: false` to
      // prove the plugin's save hook is a real, independent backstop, not
      // just riding on validation that happens to already be there.
      const { companyId: _omit, ...withoutCompanyId } = validProductInput;
      const doc = new ProductModel({ ...withoutCompanyId, sku: 'NO-COMPANY-SKU' });
      await expect(doc.save({ validateBeforeSave: false })).rejects.toThrow(
        /Tenant-scope violation/,
      );
    });
  });

  describe('aggregate hook', () => {
    it('rejects a pipeline with no $match on companyId', async () => {
      await expect(
        ProductModel.aggregate([{ $group: { _id: null, count: { $sum: 1 } } }]).exec(),
      ).rejects.toThrow(/Tenant-scope violation/);
    });

    it('allows a pipeline whose first $match stage includes companyId', async () => {
      await expect(
        ProductModel.aggregate([
          { $match: { companyId: new Types.ObjectId(companyId) } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ]).exec(),
      ).resolves.toEqual([]);
    });
  });
});
