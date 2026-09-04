import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import * as ctrl from '../controllers/documentsController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', ctrl.listDocuments);
router.post('/', requireRole('master', 'total'), ctrl.createDocument);
router.delete('/:id', requireRole('master', 'total'), ctrl.deleteDocument);
export default router;