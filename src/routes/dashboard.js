import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/dashboardController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/summary', ctrl.summary);
export default router;
