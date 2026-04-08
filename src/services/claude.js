const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Base directory for Claude sessions
const CLAUDE_SESSIONS_DIR = path.join(__dirname, '../../data/claudeSessions');

// Ensure base directory exists
if (!fs.existsSync(CLAUDE_SESSIONS_DIR)) {
    fs.mkdirSync(CLAUDE_SESSIONS_DIR, { recursive: true });
}

class ClaudePro {
    constructor(baseURL = 'https://omegatech-api.dixonomega.tech') {
        this.baseURL = baseURL;
        this.sessionId = null;
        this.username = null;
        this.conversationHistory = [];
        this.sessionFile = null;
    }

    /**
     * Get user-specific session directory
     * @param {string} username - Username
     * @returns {string} User directory path
     */
    static getUserDir(username) {
        const userDir = path.join(CLAUDE_SESSIONS_DIR, username);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        return userDir;
    }

    /**
     * Load session from user-specific session file
     * @param {string} username - Username
     * @param {string} sessionId - Session ID
     */
    loadSession(username, sessionId) {
        try {
            this.username = username;
            this.sessionId = sessionId;
            const userDir = ClaudePro.getUserDir(username);
            this.sessionFile = path.join(userDir, `${sessionId}.json`);

            if (fs.existsSync(this.sessionFile)) {
                const sessionData = JSON.parse(fs.readFileSync(this.sessionFile, 'utf-8'));
                this.sessionId = sessionData.sessionId;
                this.conversationHistory = sessionData.history || [];
                return true;
            }
        } catch (error) {
            console.error('⚠️  Failed to load session:', error.message);
        }
        return false;
    }

    /**
     * Save session to user-specific session file
     */
    saveSession() {
        try {
            if (!this.sessionFile || !this.username) {
                console.error('⚠️  No active session to save');
                return;
            }

            const sessionData = {
                sessionId: this.sessionId,
                username: this.username,
                history: this.conversationHistory,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8');
        } catch (error) {
            console.error('⚠️  Failed to save session:', error.message);
        }
    }

    /**
     * Initialize or continue a session
     * @param {string} sessionId - Session ID
     * @param {string} username - Username
     * @returns {Promise<Object>} Session info
     */
    async initSession(sessionId, username) {
        if (!username) {
            throw new Error('Username is required');
        }

        this.username = username;
        const userDir = ClaudePro.getUserDir(username);
        this.sessionFile = path.join(userDir, `${sessionId}.json`);

        if (sessionId) {
            this.sessionId = sessionId;
            // Try to load existing session
            if (fs.existsSync(this.sessionFile)) {
                this.loadSession(username, sessionId);
                return { sessionId, username, message: 'Session restored' };
            }
        }

        // Generate new session ID if not provided
        this.sessionId = sessionId || `OmegaTech_${this.generateSessionId()}`;
        
        // Create new session file
        this.conversationHistory = [];
        this.saveSession();
        
        return { sessionId: this.sessionId, username, message: 'New session created' };
    }

    /**
     * Generate random session ID
     * @returns {string} Random session ID
     */
    generateSessionId() {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * Send a prompt to Claude Pro
     * @param {string} prompt - User prompt/message
     * @param {string} sessionId - Optional session ID (overrides current session)
     * @returns {Promise<Object>} Claude response with history
     */
    async sendPrompt(prompt, sessionId = null) {
        try {
            const activeSessionId = sessionId || this.sessionId;

            if (!activeSessionId) {
                throw new Error('No active session. Please call initSession() first');
            }

            const encodedPrompt = encodeURIComponent(prompt);
            const url = `${this.baseURL}/api/ai/Claude-pro?prompt=${encodedPrompt}&sessionId=${activeSessionId}`;

            const response = await axios.get(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'ClaudePro-Node/1.0'
                }
            });

            if (response.data && response.data.success) {
                // Update local history
                if (response.data.history) {
                    this.conversationHistory = response.data.history;
                } else {
                    // Append to local history if full history not returned
                    this.conversationHistory.push(
                        { role: 'user', content: prompt },
                        { role: 'assistant', content: response.data.response }
                    );
                }

                // Update session ID
                this.sessionId = response.data.sessionId;

                // Save session to file
                this.saveSession();

                return {
                    success: true,
                    sessionId: response.data.sessionId,
                    response: response.data.response,
                    history: response.data.history || this.conversationHistory,
                    source: response.data.source,
                    timestamp: response.data.timestamp,
                    attribution: response.data.attribution
                };
            } else {
                throw new Error(response.data.message || 'Request failed');
            }
        } catch (error) {
            console.error('Error sending prompt:', error.message);
            return {
                success: false,
                error: error.message,
                sessionId: sessionId || this.sessionId
            };
        }
    }

    /**
     * Get conversation history
     * @returns {Array} Conversation history
     */
    getHistory() {
        return this.conversationHistory;
    }

    /**
     * Get full conversation as formatted text
     * @returns {string} Formatted conversation
     */
    getFormattedHistory() {
        let formatted = '';
        this.conversationHistory.forEach(msg => {
            const role = msg.role === 'user' ? '👤 You' : '🤖 Claude';
            formatted += `${role}: ${msg.content}\n\n`;
        });
        return formatted;
    }

    /**
     * Clear current session history
     */
    clearHistory() {
        this.conversationHistory = [];
        this.sessionId = null;
        this.saveSession();
    }

    /**
     * Get session info
     * @returns {Object} Session information
     */
    getSessionInfo() {
        return {
            sessionId: this.sessionId,
            historyLength: this.conversationHistory.length,
            isActive: !!this.sessionId
        };
    }

    /**
     * Review specific part of history
     * @param {number} index - Index of message to review
     * @returns {Object} Specific message from history
     */
    reviewHistoryAtIndex(index) {
        if (index >= 0 && index < this.conversationHistory.length) {
            return {
                message: this.conversationHistory[index],
                index: index,
                total: this.conversationHistory.length
            };
        }
        return {
            error: 'Index out of range',
            total: this.conversationHistory.length
        };
    }

    /**
     * Search history by keyword
     * @param {string} keyword - Search keyword
     * @returns {Array} Matching messages
     */
    searchHistory(keyword) {
        const keywordLower = keyword.toLowerCase();
        return this.conversationHistory.filter(msg =>
            msg.content.toLowerCase().includes(keywordLower)
        );
    }
}

// CLI usage
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node claude.js <question>');
        console.log('       node claude.js --reset (to clear session)');
        console.log('       node claude.js --history (to view conversation history)');
        process.exit(1);
    }

    // Handle special commands
    if (args[0] === '--reset') {
        const claude = new ClaudePro();
        claude.clearHistory();
        console.log('✅ Session cleared');
        process.exit(0);
    }

    if (args[0] === '--history') {
        const claude = new ClaudePro();
        const sessionLoaded = claude.loadSession();
        if (sessionLoaded && claude.conversationHistory.length > 0) {
            console.log(claude.getFormattedHistory());
        } else {
            console.log('📝 No conversation history found');
        }
        process.exit(0);
    }

    // Handle normal question
    const question = args.join(' ');
    const claude = new ClaudePro();

    // Try to load existing session or create new one
    const sessionLoaded = claude.loadSession();
    if (!sessionLoaded) {
        await claude.initSession();
    }

    console.log('🤖 Claude Pro\n');
    console.log(`💬 You: ${question}\n`);

    const result = await claude.sendPrompt(question);

    if (result.success) {
        console.log(`🤖 Claude: ${result.response}\n`);
        console.log(`📊 Session ID: ${result.sessionId}`);
    } else {
        console.error(`❌ Error: ${result.error}`);
        process.exit(1);
    }
}

// Export for use in other modules
module.exports = { ClaudePro };

// Run CLI if executed directly
if (require.main === module) {
    main().catch(console.error);
}
