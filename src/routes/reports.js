import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/reportsController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', ctrl.listReports);
router.post('/generate', ctrl.generateReport);
router.get('/:id', ctrl.getReport);
export default router;
