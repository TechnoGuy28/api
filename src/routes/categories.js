import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/categoriesController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', ctrl.listCategories);
router.post('/', ctrl.createCategory);
router.put('/:id', ctrl.updateCategory);
export default router;
