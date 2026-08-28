import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/closingsController.js';

const router = express.Router();
router.use(authMiddleware);
router.post('/', ctrl.createClosing);
router.get('/last', ctrl.getLastClosing);
router.get('/', ctrl.listClosings);
export default router;
