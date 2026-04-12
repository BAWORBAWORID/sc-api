module.exports = {
  PORT: process.env.PORT || 3000,
  WS_PORT: process.env.WS_PORT || 3000,
  // WhatsApp bug types
  BUGS: [
    { bug_id: "crashui", bug_name: "CRASH UI" },
    { bug_id: "delayx", bug_name: "DELAY X" },
    { bug_id: "blackscreen", bug_name: "BLACK SCREEN" },
    { bug_id: "freezeclick", bug_name: "FREEZE CLICK" },
    { bug_id: "uno", bug_name: "UNO CRASH" },
    { bug_id: "pay", bug_name: "PAY CRASH" },
    { bug_id: "xvar", bug_name: "XVAR CRASH" },
    { bug_id: "calllog", bug_name: "CALL LOG CRASH" },
    { bug_id: "invisiblespam", bug_name: "INVISIBLE SPAM" },
    { bug_id: "all", bug_name: "ALL BUGS COMBO" }
  ],

  payload: [
    { bug_id: "crashui", bug_name: "CRASH UI" },
    { bug_id: "delayx", bug_name: "DELAY X" },
    { bug_id: "blackscreen", bug_name: "BLACK SCREEN" },
    { bug_id: "freezeclick", bug_name: "FREEZE CLICK" },
    { bug_id: "uno", bug_name: "UNO CRASH" },
    { bug_id: "pay", bug_name: "PAY CRASH" },
    { bug_id: "xvar", bug_name: "XVAR CRASH" },
    { bug_id: "calllog", bug_name: "CALL LOG CRASH" },
    { bug_id: "invisiblespam", bug_name: "INVISIBLE SPAM" }
  ],
    
  DDOS: [
    { ddos_id: "s-gbps", ddos_name: "SYN High GBPS" },
    { ddos_id: "s-pps", ddos_name: "SYN Traffic Flood" },
    { ddos_id: "a-gbps", ddos_name: "ACK High GBPS" },
    { ddos_id: "a-pps", ddos_name: "ACK Traffic Flood" },
    { ddos_id: "icmp", ddos_name: "ICMP Flood" },
    { ddos_id: "udp", ddos_name: "GUDP ( HIGH RISK )" }

  ],
  // News data
  NEWS: [
    {
      image: "https://a.top4top.io/p_3696nya4z1.jpg",
      title: "PCN CRASHER",
      desc: "PCN Crash Tools Official"
    }
  ],
  // Role cooldowns (in seconds) - for bug features
  ROLE_COOLDOWNS: {
    dev: 1,
    owner: 3,
    vip: 30,
    reseller: 60,
    member: 120,
  },
  // Max quantities by role
  MAX_QUANTITIES: {
    member: 5,
    reseller: 5,
    vip: 10,
    owner: 10,
    dev: 999,
  }
};