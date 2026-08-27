import express from 'express';
import * as ctrl from '../controllers/authController.js';

const router = express.Router();
router.post('/login', ctrl.login);
router.get('/me', ctrl.me);
router.post('/logout', ctrl.logout);
export default router;
