import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/auditController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/logs', ctrl.listLogs);
export default router;
