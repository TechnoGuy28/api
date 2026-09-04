import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import * as ctrl from '../controllers/categoriesController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', ctrl.listCategories);
router.post('/', requireRole('master', 'total'), ctrl.createCategory);
router.put('/:id', requireRole('master', 'total'), ctrl.updateCategory);
export default router;
