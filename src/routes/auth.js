const express = require('express');
const AuthController = require('../controllers/authController');
const { logger } = require('../utils/logger');
const authMiddleware = require('../middleware/authMiddleware');
const { generateKey, recordKey, activeKeys } = require('../middleware/authMiddleware');

const router = express.Router();

// Validate login and generate session key
// Supports both form-urlencoded (from Dart) and JSON
router.post("/validate", AuthController.validate);

// Get user info (auto-login/session validation)
router.get("/myInfo", AuthController.getMyInfo);

module.exports = router;