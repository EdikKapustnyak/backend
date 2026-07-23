import { Router } from 'express';
import * as adminDashboardController from './admin-dashboard.controller.js';
import { authenticateAdmin } from '../platform-admin/authenticateAdmin.js';

/** Mounted at /admin/dashboard - platform-admin only. A single aggregate endpoint (not several small ones) since every widget on this screen needs to load together anyway - see admin-dashboard.service.ts#getDashboardSummary. */
export const adminDashboardRouter = Router();

adminDashboardRouter.use(authenticateAdmin);
adminDashboardRouter.get('/', adminDashboardController.getAdminDashboard);
