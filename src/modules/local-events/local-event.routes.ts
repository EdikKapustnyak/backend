import { Router } from 'express';
import * as localEventController from './local-event.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';

export const localEventRouter = Router();

localEventRouter.use(authenticate);

// ?refresh=true bypasses the cache and forces a fresh AI + web search call.
localEventRouter.get('/', localEventController.localEvents);
