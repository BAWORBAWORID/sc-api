const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');
const { activeKeys } = require('../middleware/authMiddleware');
const { loadDatabase } = require('../services/databaseService');
const { logger } = require('../utils/logger');

// Send code endpoint (GET with query params)
router.get('/send-code', async (req, res) => {
  try {
    const { key, phone } = req.query;
    
    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      return res.json({ valid: false, message: "Invalid session key" });
    }
    
    const result = await telegramController.sendCode(phone);
    return res.json({ valid: true, ...result });
  } catch (e) {
    return res.json({ valid: false, message: e.message });
  }
});

// Login endpoint (GET with query params)
router.get('/login', async (req, res) => {
  try {
    const { key, phone, code } = req.query;
    
    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      return res.json({ valid: false, message: "Invalid session key" });
    }
    
    const result = await telegramController.login(phone, code);
    return res.json({ valid: true, ...result });
  } catch (e) {
    return res.json({ valid: false, message: e.message });
  }
});

// Get sessions endpoint
router.get('/sessions', (req, res) => {
  try {
    const { key } = req.query;
    
    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      return res.json({ valid: false, message: "Invalid session key" });
    }
    
    const sessions = telegramController.getSessions(keyInfo.username);
    return res.json({ valid: true, sessions });
  } catch (e) {
    return res.json({ valid: false, message: e.message });
  }
});

// Report endpoint (GET with query params)
router.get('/report', async (req, res) => {
  try {
    const { key, target, reason, count } = req.query;
    
    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      return res.json({ valid: false, message: "Invalid session key" });
    }
    
    const result = await telegramController.report(target, reason, parseInt(count) || 50);
    return res.json({ valid: true, ...result });
  } catch (e) {
    return res.json({ valid: false, message: e.message });
  }
});

module.exports = router;