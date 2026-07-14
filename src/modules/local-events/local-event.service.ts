import { companyRepository } from '../companies/company.repository.js';
import { localEventRepository } from './local-event.repository.js';
import type { LocalEventsCacheDocument } from './local-event.model.js';
import type { LocalEventItem, PublicLocalEvents } from './local-event.types.js';
import { anthropicClient } from '../../utils/anthropicClient.js';
import { NotFoundError, BadRequestError } from '../../errors/index.js';

function toPublicLocalEvents(doc: LocalEventsCacheDocument, fromCache: boolean): PublicLocalEvents {
  return {
    city: doc.city,
    businessType: doc.businessType,
    events: doc.events,
    generatedAt: doc.generatedAt,
    expiresAt: doc.expiresAt,
    fromCache,
  };
}

async function fetchEventsFromAI(
  city: string,
  businessType: string | null,
): Promise<LocalEventItem[]> {
  const businessContext = businessType
    ? `для бизнеса типа "${businessType}"`
    : 'для розничного или сервисного бизнеса';

  const prompt = `Найди в интернете значимые события (концерты, фестивали, спортивные матчи, ярмарки, городские праздники и т.д.), которые пройдут в городе ${city} в ближайшие 30 дней и могут увеличить поток посетителей ${businessContext}.

Верни ТОЛЬКО валидный JSON, без каких-либо пояснений вокруг, ровно в таком формате:
{"events": [{"name": "...", "date": "YYYY-MM-DD", "description": "...", "relevance": "..."}]}

"relevance" - короткое объяснение (1 предложение), почему событие может повлиять на посещаемость. Используй только события, которые реально нашёл через поиск - не придумывай. Если ничего значимого не нашёл, верни {"events": []}.`;

  const result = await anthropicClient.askClaudeForJson<{ events: LocalEventItem[] }>(prompt, {
    enableWebSearch: true,
    maxTokens: 2000,
  });

  return Array.isArray(result.events) ? result.events : [];
}

/**
 * Cache-first: returns the cached result if one exists and hasn't expired
 * (Company.localEventsCacheTtlDays, configurable per company via PATCH
 * /companies/me - defaults to 7 days), otherwise calls Claude with web
 * search enabled and caches the result. Pass forceRefresh to skip the
 * cache even if it's still fresh.
 */
export async function getLocalEvents(
  companyId: string,
  forceRefresh = false,
): Promise<PublicLocalEvents> {
  const company = await companyRepository.findById(companyId);
  if (!company) throw new NotFoundError('Company not found');
  // city is required at registration and can't be cleared via PATCH
  // /companies/me (unlike businessType), so this should be unreachable
  // through the API today - kept as defense-in-depth against direct DB
  // writes, data imported another way, or a future schema change that
  // makes city nullable again.
  if (!company.city) {
    throw new BadRequestError(
      'Set your company city first (PATCH /companies/me) before requesting local events',
    );
  }

  if (!forceRefresh) {
    const cached = await localEventRepository.findFreshByCompany(companyId);
    if (cached) return toPublicLocalEvents(cached, true);
  }

  const events = await fetchEventsFromAI(company.city, company.businessType);
  const saved = await localEventRepository.upsert(
    companyId,
    company.city,
    company.businessType,
    events,
    company.localEventsCacheTtlDays,
  );

  return toPublicLocalEvents(saved, false);
}
