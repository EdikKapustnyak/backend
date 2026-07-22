import { writeOffRepository, type WasteByProduct, type WasteByReason } from '../write-offs/write-off.repository.js';
import { purchaseRepository } from '../purchases/purchase.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { receiptRepository, type RevenueByDay } from '../receipts/receipt.repository.js';
import { WRITE_OFF_REASON_LABELS } from '../write-offs/write-off.labels.js';
import { anthropicClient } from '../../utils/anthropicClient.js';

export interface WasteByReasonPublic {
  reason: string;
  quantity: number;
  count: number;
}

export interface WasteAnalyticsSummary {
  from: Date;
  to: Date;
  totalQuantity: number;
  totalEstimatedCost: number;
  totalPurchases: number;
  /** Estimated waste cost as a percentage of what was purchased in the same period. */
  wasteRatioPercent: number;
  byProduct: WasteByProduct[];
  byReason: WasteByReasonPublic[];
}

/** Fallback only - matches the schema default in company.model.ts. Used if the company can't be found for some reason (defensive; company always exists for a valid, authenticated companyId in practice). */
const FALLBACK_LOOKBACK_DAYS = 30;

async function computeDefaultRangeFrom(companyId: string, rangeTo: Date): Promise<Date> {
  const company = await companyRepository.findById(companyId);
  const lookbackDays = company?.wasteAnalyticsDefaultLookbackDays ?? FALLBACK_LOOKBACK_DAYS;
  return new Date(rangeTo.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
}

/**
 * The deterministic data layer: pure MongoDB aggregations, no AI involved.
 * Safe to call on its own if only the numbers are needed.
 */
export async function getWasteAnalytics(
  companyId: string,
  from?: Date,
  to?: Date,
): Promise<WasteAnalyticsSummary> {
  const rangeTo = to ?? new Date();
  const rangeFrom = from ?? (await computeDefaultRangeFrom(companyId, rangeTo));

  const [byProduct, byReasonRaw, totalPurchases] = await Promise.all([
    writeOffRepository.getWasteByProduct(companyId, rangeFrom, rangeTo),
    writeOffRepository.getWasteByReason(companyId, rangeFrom, rangeTo),
    purchaseRepository.getTotalCompletedAmount(companyId, rangeFrom, rangeTo),
  ]);

  const byReason: WasteByReasonPublic[] = byReasonRaw.map((entry: WasteByReason) => ({
    reason: WRITE_OFF_REASON_LABELS[entry.reason],
    quantity: entry.quantity,
    count: entry.count,
  }));

  const totalQuantity = byReason.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalEstimatedCost = byProduct.reduce((sum, entry) => sum + entry.estimatedCost, 0);
  const wasteRatioPercent = totalPurchases > 0 ? (totalEstimatedCost / totalPurchases) * 100 : 0;

  return {
    from: rangeFrom,
    to: rangeTo,
    totalQuantity,
    totalEstimatedCost,
    totalPurchases,
    wasteRatioPercent,
    byProduct,
    byReason,
  };
}

export interface RevenueAnalyticsSummary {
  from: Date;
  to: Date;
  totalRevenue: number;
  daysWithData: number;
  /** totalRevenue / number of calendar days in [from, to] - not just daysWithData, so gaps (no entry logged) pull the average down rather than being silently skipped. */
  averageDailyRevenue: number;
  byDay: RevenueByDay[];
}

/**
 * Deterministic aggregation over manually-entered daily revenue receipts
 * (Receipt.type = 'daily_revenue') - same pattern as getWasteAnalytics:
 * pure MongoDB aggregation, no AI, reuses the company's configurable
 * default lookback window.
 */
export async function getRevenueAnalytics(
  companyId: string,
  from?: Date,
  to?: Date,
): Promise<RevenueAnalyticsSummary> {
  const rangeTo = to ?? new Date();
  const rangeFrom = from ?? (await computeDefaultRangeFrom(companyId, rangeTo));

  const byDay = await receiptRepository.getRevenueByDay(companyId, rangeFrom, rangeTo);

  const totalRevenue = byDay.reduce((sum, entry) => sum + entry.amount, 0);
  const totalDaysInRange = Math.max(
    1,
    Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return {
    from: rangeFrom,
    to: rangeTo,
    totalRevenue,
    daysWithData: byDay.length,
    averageDailyRevenue: totalRevenue / totalDaysInRange,
    byDay,
  };
}

function buildNarrativePrompt(summary: WasteAnalyticsSummary): string {
  const productLines =
    summary.byProduct
      .map((p) => `- ${p.productName}: ${p.quantity} шт, ~${p.estimatedCost.toFixed(2)}`)
      .join('\n') || '(нет списаний за период)';
  const reasonLines =
    summary.byReason
      .map((r) => `- ${r.reason}: ${r.quantity} шт (${r.count} списаний)`)
      .join('\n') || '(нет данных)';

  return `Ты — бизнес-аналитик склада. Ниже реальные данные о списаниях товара за период. Не придумывай ничего сверх этих цифр и не упоминай товары, которых нет в списке.

ДАННЫЕ
Период: ${summary.from.toISOString().slice(0, 10)} — ${summary.to.toISOString().slice(0, 10)}
Всего списано: ${summary.totalQuantity} единиц, оценочная стоимость ~${summary.totalEstimatedCost.toFixed(2)}
Закуплено за период (завершённые закупки): ~${summary.totalPurchases.toFixed(2)}
Доля потерь от объёма закупок: ${summary.wasteRatioPercent.toFixed(1)}%

Топ товаров по потерям:
${productLines}

Списания по причинам:
${reasonLines}

Задача: напиши на русском языке 3-5 предложений анализа, затем 2-3 конкретные рекомендации по сокращению потерь, ссылаясь на реальные цифры и товары из данных выше. Если данных мало или списаний не было — так и скажи, не выдумывай проблему. Ответь только текстом анализа и рекомендаций, без вступлений вроде "Вот анализ:" и без markdown-заголовков.`;
}

export interface WasteAnalyticsWithNarrative extends WasteAnalyticsSummary {
  narrative: string;
}

/**
 * The AI layer: takes the deterministic summary above and asks Claude to
 * turn it into a plain-language analysis + recommendations. The numbers
 * are always computed by getWasteAnalytics(), never by the model - the
 * model only narrates and suggests, grounded in the data it's given.
 */
export async function getWasteAnalyticsWithNarrative(
  companyId: string,
  from?: Date,
  to?: Date,
): Promise<WasteAnalyticsWithNarrative> {
  const summary = await getWasteAnalytics(companyId, from, to);
  const narrative = await anthropicClient.askClaude(buildNarrativePrompt(summary), { maxTokens: 700 });

  return { ...summary, narrative };
}
