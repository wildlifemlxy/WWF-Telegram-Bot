import express from 'express';
import { identifyController } from '../Controller/identify/identifyController.js';

const router = express.Router();

// Single endpoint /identify - handles both identify and health via 'action' parameter
router.post('/', identifyController.handleRequest);
router.get('/', identifyController.handleRequest);

export default router;
