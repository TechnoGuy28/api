import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as pubCtrl from '../controllers/publicationsController.js';
import * as movCtrl from '../controllers/movementsController.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/', pubCtrl.listPublications);
router.post('/', pubCtrl.createPublication);
router.get('/stock-summary', pubCtrl.stockSummary);
router.get('/:id', pubCtrl.getPublication);
router.put('/:id', pubCtrl.updatePublication);
router.patch('/:id/deactivate', pubCtrl.deactivatePublication);

router.get('/:id/movements', movCtrl.listMovements);
router.post('/:id/movements', movCtrl.createMovement);
router.get('/:id/history/monthly', movCtrl.monthlyHistory);

export default router;
