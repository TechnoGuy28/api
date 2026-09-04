import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import * as pubCtrl from '../controllers/publicationsController.js';
import * as movCtrl from '../controllers/movementsController.js';

const router = express.Router();
router.use(authMiddleware);

// Leitura liberada a qualquer autenticado (inclusive 'leitor').
router.get('/', pubCtrl.listPublications);
router.get('/stock-summary', pubCtrl.stockSummary);
router.get('/:id', pubCtrl.getPublication);

// Escrita de publicacoes: apenas master/total.
router.post('/', requireRole('master', 'total'), pubCtrl.createPublication);
router.put('/:id', requireRole('master', 'total'), pubCtrl.updatePublication);
router.patch('/:id/deactivate', requireRole('master', 'total'), pubCtrl.deactivatePublication);
router.delete('/:id', requireRole('master', 'total'), pubCtrl.deletePublication);

router.get('/:id/movements', movCtrl.listMovements);
router.post('/:id/movements', requireRole('master', 'total'), movCtrl.createMovement);
router.get('/:id/history/monthly', movCtrl.monthlyHistory);

export default router;
