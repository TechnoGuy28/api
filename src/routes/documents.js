import express from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import * as ctrl from '../controllers/documentsController.js';

const router = express.Router();
router.use(authMiddleware);
router.get('/', ctrl.listDocuments);
router.post('/', ctrl.createDocument);
router.delete('/:id', ctrl.deleteDocument);
export default router;