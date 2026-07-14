import { Router } from 'express';
import * as localEventController from './local-event.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';

export const localEventRouter = Router();

localEventRouter.use(authenticate);
localEventRouter.use(requireActiveSubscription);

// Available on every plan (confirmed decision - ADR-0001 originally
// proposed gating this behind Business+, see billing/plan.config.ts for
// where that was overridden).
// ?refresh=true bypasses the cache and forces a fresh AI + web search call.
localEventRouter.get('/', localEventController.localEvents);
