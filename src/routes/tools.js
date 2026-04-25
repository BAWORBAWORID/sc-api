const express = require('express');
const router = express.Router();
const ToolsController = require('../controllers/toolsController');

// NIK Check (using external API)
router.get('/nik-check', ToolsController.nikCheck);

// Subdomain Finder
router.get('/subdomain-finder', ToolsController.subdomainFinder);

// ChatAI - Generate New Session
router.get('/chat/new-session', ToolsController.generateNewSession);

// ChatAI - Send Message
router.get('/chat/send', ToolsController.sendMessage);

// ChatAI - Get Chat History
router.get('/chat/history', ToolsController.getChatHistory);

// ChatAI - Delete Chat History
router.get('/chat/delete', ToolsController.deleteChatHistory);

// ChatAI - Get User Chat History List
router.get('/chat/list', ToolsController.getChatHistoryList);

// ChatAI - Get Session Info
router.get('/chat/session-info', ToolsController.getSessionInfo);

// ChatAI - Search History by Keyword
router.get('/chat/search', ToolsController.searchHistory);

// ChatAI - Review History at Index
router.get('/chat/review', ToolsController.reviewHistoryAtIndex);

// ChatAI - Reset Session
router.get('/chat/reset', ToolsController.resetSession);

module.exports = router;