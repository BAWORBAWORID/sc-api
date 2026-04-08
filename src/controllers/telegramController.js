const telegramService = require('../services/telegramService');
const { logger } = require('../utils/logger');

exports.sendCode = async (phoneNumber) => {
    try {
        const result = await telegramService.sendCode(phoneNumber);
        return { success: true, ...result };
    } catch (e) {
        return { success: false, message: e.message };
    }
};

exports.login = async (phoneNumber, code) => {
    try {
        const result = await telegramService.signIn(phoneNumber, code);
        return { success: true, message: "Login success", user: result };
    } catch (e) {
        return { success: false, message: e.message };
    }
};

exports.getSessions = (username) => {
    const sessions = telegramService.getSavedSessions();
    return { success: true, data: sessions };
};

exports.report = async (target, reason, count) => {
    try {
        const result = await telegramService.executeReport(target, reason, count);
        return { success: true, ...result };
    } catch (e) {
        return { success: false, message: e.message };
    }
};