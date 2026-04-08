const express = require('express');
const fs = require('fs');
const { logger } = require('../utils/logger');
const { loadDatabase, saveDatabase } = require('../services/databaseService');
const { activeKeys } = require('../middleware/authMiddleware');
const { addActivityLog } = require('../services/activityLogService');

class UserController {

  // ==========================================
  // CREATE MEMBER BIASA (Via Link/Bot)
  // ==========================================
  static async createAccount(req, res) {
    const { key, newUser, pass, day } = req.query;
    logger.info(`[👤 CREATE] Request create user '${newUser}' dengan key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ CREATE] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid key." });
    }

    const db = loadDatabase();
    const creator = db.find(u => u.username === keyInfo.username);

    const allowedCreators = ["dev", "owner", "reseller", "vip"];

    if (!creator || !allowedCreators.includes(creator.role)) {
      logger.info(`[❌ CREATE] ${creator?.username || "Unknown"} tidak memiliki izin.`);
      return res.json({ valid: true, authorized: false, message: "Not authorized." });
    }

    if (creator.role.includes("reseller") && parseInt(day) > 30) {
      logger.info("[❌ CREATE] Reseller tidak boleh membuat member lebih dari 30 hari.");
      return res.json({ valid: true, created: false, message: "Reseller can only create accounts up to 30 days." });
    }

    if (db.find(u => u.username === newUser)) {
      logger.info("[❌ CREATE] Username sudah digunakan.");
      return res.json({ valid: true, created: false, message: "Username already exists." });
    }

    const expired = new Date();
    expired.setDate(expired.getDate() + parseInt(day));

    const newAccount = {
      username: newUser,
      password: pass,
      expiredDate: expired.toISOString().split("T")[0],
      role: "member",
      parent: creator.username,
    };

    db.push(newAccount);
    saveDatabase(db);

    logger.info("[✅ CREATE] Akun berhasil dibuat:", newAccount);
    const logLine = `${creator.username} Created ${newUser} duration ${day}\n`;
    fs.appendFileSync('logUser.txt', logLine);

    addActivityLog(creator.username, 'Create Account', {
      newUsername: newUser,
      duration: day,
      newRole: "member"
    });

    return res.json({ valid: true, created: true, message: "Account created successfully", user: newAccount });
  }

  // ==========================================
  // DELETE USER
  // ==========================================
  static async deleteAccount(req, res) {
    const { key, username } = req.query;
    logger.info(`[🗑️ DELETE] Request hapus user '${username}' oleh key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ DELETE] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid key." });
    }

    const db = loadDatabase();
    const admin = db.find(u => u.username === keyInfo.username);

    const allowedDeleters = ["dev", "owner"];

    if (!admin || !allowedDeleters.includes(admin.role)) {
      logger.info(`[❌ DELETE] ${admin?.username || "Unknown"} tidak memiliki izin.`);
      return res.json({ valid: true, authorized: false, message: "Unauthorized to delete users." });
    }

    const index = db.findIndex(u => u.username === username);
    if (index === -1) {
      logger.info("[❌ DELETE] User tidak ditemukan.");
      return res.json({ valid: true, deleted: false, message: "User not found." });
    }

    const targetUser = db[index];

    const roleLevels = {
        "dev": 100,
        "owner": 90,
        "vip": 40,
        "reseller": 30,
        "member": 10
    };

    const adminLevel = roleLevels[admin.role] || 0;
    const targetLevel = roleLevels[targetUser.role] || 0;

    if (adminLevel <= targetLevel) {
        logger.info(`[❌ DELETE] ${admin.role} (level ${adminLevel}) mencoba menghapus ${targetUser.role} (level ${targetLevel}), ditolak.`);
        return res.json({
            valid: true,
            authorized: false,
            message: `Cannot delete ${targetUser.role}. Your role can only delete users with lower level.`
        });
    }

    const deletedUser = db[index];
    db.splice(index, 1);
    saveDatabase(db);

    logger.info("[✅ DELETE] User berhasil dihapus:", deletedUser);
    const logLine = `${admin.username} Deleted ${deletedUser.username} (Parent: ${deletedUser.parent || 'SYSTEM'})\n`;
    fs.appendFileSync('logUser.txt', logLine);

    addActivityLog(admin.username, 'Delete Account', {
      deletedUsername: deletedUser.username,
      deletedRole: deletedUser.role,
      parent: deletedUser.parent || 'SYSTEM'
    });

    return res.json({ valid: true, deleted: true, message: "User deleted successfully", user: deletedUser });
  }

  // ==========================================
  // EDIT USER (Tambah Masa Aktif)
  // ==========================================
  static async editUser(req, res) {
    const { key, username, addDays } = req.query;
    logger.info(`[🛠️ EDIT] Tambah masa aktif ${username} +${addDays} hari oleh key ${key}`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ EDIT] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid key." });
    }

    const db = loadDatabase();
    const editor = db.find(u => u.username === keyInfo.username);

    const allowedEditors = ["dev", "owner", "reseller", "vip"];
    if (!editor || !allowedEditors.includes(editor.role)) {
      logger.info(`[❌ EDIT] ${editor?.username || "Unknown"} tidak memiliki izin.`);
      return res.json({ valid: true, authorized: false, message: "Unauthorized role." });
    }

    if (editor.role === "reseller" && parseInt(addDays) > 30) {
      logger.info("[❌ EDIT] Reseller tidak boleh menambah lebih dari 30 hari.");
      return res.json({ valid: true, authorized: true, edited: false, message: "Reseller can only add up to 30 days." });
    }

    const targetUser = db.find(u => u.username === username);
    if (!targetUser) {
      logger.info("[❌ EDIT] User tidak ditemukan.");
      return res.json({ valid: true, authorized: true, edited: false, message: "User not found." });
    }

    if (editor.role === "reseller" && targetUser.role !== "member") {
      logger.info("[❌ EDIT] Reseller hanya bisa mengedit user dengan role 'member'.");
      return res.json({ valid: true, authorized: true, edited: false, message: "Reseller can only edit users with role 'member'." });
    }

    const currentDate = new Date(targetUser.expiredDate);
    currentDate.setDate(currentDate.getDate() + parseInt(addDays));
    targetUser.expiredDate = currentDate.toISOString().split("T")[0];

    saveDatabase(db);

    logger.info(`[✅ EDIT] Masa aktif ${username} diperbarui ke ${targetUser.expiredDate}`);
    const logLine = `${editor.username} Edited ${username} (Parent: ${targetUser.parent || 'SYSTEM'}) Add Days ${addDays}\n`;
    fs.appendFileSync('logUser.txt', logLine);

    addActivityLog(editor.username, 'Edit User', {
      targetUsername: username,
      addDays,
      newExpiryDate: targetUser.expiredDate,
      parent: targetUser.parent || 'SYSTEM'
    });

    return res.json({ valid: true, authorized: true, edited: true, message: "User expiration updated successfully", user: targetUser });
  }

  // ==========================================
  // CHANGE PASSWORD (SELF)
  // ==========================================
  static async changePassword(req, res) {
    const { key, oldPassword, newPassword } = req.body;
    logger.info(`[🔑 PASSWORD] Change password request for key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ PASSWORD] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid session key" });
    }

    const db = loadDatabase();
    const user = db.find(u => u.username === keyInfo.username && u.password === oldPassword);

    if (!user) {
      logger.error(`[❌ PASSWORD] Invalid old password for user: ${keyInfo.username}`);
      return res.json({ valid: false, message: "Invalid old password" });
    }

    user.password = newPassword;
    saveDatabase(db);

    logger.info(`[✅ PASSWORD] Password berhasil diubah untuk user: ${keyInfo.username}`);

    addActivityLog(keyInfo.username, 'Change Password', {
      success: true
    });

    return res.json({ valid: true, message: "Password updated successfully" });
  }

  // ==========================================
  // LIST USERS (HIERARCHY BASED)
  // ==========================================
  static async listUsers(req, res) {
    const { key } = req.query;
    logger.info(`[📋 LIST] Request lihat semua user oleh key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ LIST] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid key." });
    }

    const db = loadDatabase();
    const requester = db.find(u => u.username === keyInfo.username);

    if (!requester) {
      logger.info("[❌ LIST] User tidak ditemukan.");
      return res.json({ valid: false, message: "User not found." });
    }

    const roleLevels = {
      "dev": 100,
      "owner": 90,
      "vip": 40,
      "reseller": 30,
      "member": 10
    };

    const requesterLevel = roleLevels[requester.role] || 0;

    let filteredUsers = db.filter(u => {
      const userLevel = roleLevels[u.role] || 0;
      return userLevel < requesterLevel;
    });

    const users = filteredUsers.map(u => ({
      username: u.username,
      expiredDate: u.expiredDate,
      role: u.role || "member",
      parent: u.parent || "SYSTEM",
    }));

    logger.info(`[✅ LIST] Menampilkan ${users.length} user (filtered by hierarchy)`);
    return res.json({ valid: true, authorized: true, users, requesterRole: requester.role });
  }

  // ==========================================
  // USER ADD (ADD SPECIFIC ROLE)
  // ==========================================
  static async userAdd(req, res) {
    const { key, username, password, role, day } = req.query;
    logger.info(`[➕ USERADD] ${username} dengan role ${role} oleh key ${key}`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ USERADD] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid key." });
    }

    const db = loadDatabase();
    const creator = db.find(u => u.username === keyInfo.username);

    if (!creator) {
        return res.json({ valid: true, authorized: false, message: "Creator not found." });
    }

    const roleLevels = {
      "dev": 100,
      "owner": 90,
      "vip": 40,
      "reseller": 30,
      "member": 10
    };

    const creatorLevel = roleLevels[creator.role] || 0;
    const targetRole = role || "member";
    const targetLevel = roleLevels[targetRole] || 0;

    if (targetLevel >= creatorLevel) {
        logger.info(`[❌ USERADD] ${creator.role} (level ${creatorLevel}) mencoba membuat ${targetRole} (level ${targetLevel}), ditolak.`);
        return res.json({
            valid: true,
            authorized: false,
            message: `Cannot create ${targetRole}. Your role (${creator.role}) can only create roles below your level.`
        });
    }

    if (creator.role !== "dev") {
        if (creator.role === "reseller" && targetRole !== "member") {
            logger.info("[❌ USERADD] Reseller hanya bisa membuat member.");
            return res.json({
                valid: true,
                authorized: false,
                message: "Reseller can only create 'member' accounts."
            });
        }

        if (creator.role === "vip") {
            logger.info("[❌ USERADD] VIP tidak dapat membuat user.");
            return res.json({
                valid: true,
                authorized: false,
                message: "VIP role cannot create new users."
            });
        }
    }

    if (db.find(u => u.username === username)) {
      logger.info("[❌ USERADD] Username sudah ada.");
      return res.json({ valid: true, created: false, message: "Username already exists." });
    }

    const expired = new Date();
    expired.setDate(expired.getDate() + parseInt(day));

    const newUser = {
      username,
      password,
      role: targetRole,
      expiredDate: expired.toISOString().split("T")[0],
      parent: creator.username,
    };

    db.push(newUser);
    saveDatabase(db);

    logger.info(`[✅ USERADD] User ${username} dengan role ${targetRole} berhasil dibuat`);
    const logLine = `${creator.username} Created ${username} Role ${targetRole} Days ${day}\n`;
    fs.appendFileSync('logUser.txt', logLine);

    return res.json({ valid: true, authorized: true, created: true, message: "User created successfully", user: newUser });
  }

  // ==========================================
  // GET LOGS
  // ==========================================
  static async getLog(req, res) {
    const { key } = req.query;
    logger.info(`[📄 LOG] Request log oleh key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ LOG] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid key." });
    }

    const db = loadDatabase();
    const admin = db.find(u => u.username === keyInfo.username);

    const allowedViewers = ["dev", "owner"];

    if (!admin || !allowedViewers.includes(admin.role)) {
      logger.info(`[❌ LOG] ${admin?.username || "Unknown"} bukan admin.`);
      return res.json({ valid: true, authorized: false, message: "Only Admin levels can view logs." });
    }

    try {
      if (!fs.existsSync('logUser.txt')) {
          fs.writeFileSync('logUser.txt', '');
      }
      const logContent = fs.readFileSync('logUser.txt', 'utf-8');
      return res.json({ valid: true, authorized: true, logs: logContent });
    } catch (err) {
      logger.error(`[❌ LOG] Error reading log file: ${err.message}`);
      return res.json({ valid: true, authorized: true, logs: "", message: "Failed to read log file." });
    }
  }
}

module.exports = UserController;