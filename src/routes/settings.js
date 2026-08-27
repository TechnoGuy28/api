import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/settingsController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', ctrl.getSettings);
router.put('/closing-day', ctrl.setClosingDay);
export default router;
