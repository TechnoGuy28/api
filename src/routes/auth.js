import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/authController.js';

const router = express.Router();
router.post('/login', ctrl.login);
router.get('/me', authMiddleware, ctrl.me);
router.post('/logout', authMiddleware, ctrl.logout);
export default router;
