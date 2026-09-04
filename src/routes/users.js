import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import * as ctrl from '../controllers/usersController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', requireRole('master', 'total'), ctrl.listUsers);
router.post('/', requireRole('master', 'total'), ctrl.createUser);
router.put('/:id', requireRole('master', 'total'), ctrl.updateUser);
router.patch('/:id/phone', ctrl.updatePhone); // telefone proprio liberado; controller valida
export default router;
