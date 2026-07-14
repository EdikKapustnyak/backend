import { Router } from 'express';
import * as localEventController from './local-event.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireFeature } from '../../middlewares/requireFeature.js';

export const localEventRouter = Router();

localEventRouter.use(authenticate);
localEventRouter.use(requireActiveSubscription);
localEventRouter.use(requireFeature('ai'));

// ?refresh=true bypasses the cache and forces a fresh AI + web search call.
localEventRouter.get('/', localEventController.localEvents);
