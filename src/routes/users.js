import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/usersController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', ctrl.listUsers);
router.post('/', ctrl.createUser);
router.put('/:id', ctrl.updateUser);
router.patch('/:id/phone', ctrl.updatePhone);
export default router;
