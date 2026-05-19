// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔑 DISCORD KEY BOT - ENHANCED EDITION - ALL-IN-ONE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION - EDIT THESE VALUES BEFORE RUNNING
// ════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Discord Bot Configuration
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",
  CLIENT_ID: process.env.CLIENT_ID || "1505814325032648714",
  GUILD_ID: process.env.GUILD_ID || "1505024700680765500",
  
  // API Server Port
  PORT: process.env.PORT || 3001,
  
  // Auto-Deploy Commands (set to true to auto-register slash commands on startup)
  AUTO_DEPLOY: true,
};

// ════════════════════════════════════════════════════════════════════════════
// DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU'RE DOING
// ════════════════════════════════════════════════════════════════════════════

const {
  Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  REST, Routes
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const fs   = require("fs");
const path = require("path");
const http = require("http");

const DB_PATH  = path.join(__dirname, "keys.json");
const CFG_PATH = path.join(__dirname, "config.json");

// ── DB & Config ───────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH))
    fs.writeFileSync(DB_PATH, JSON.stringify({ 
      keys: {}, 
      userMap: {}, 
      blacklist: { users: {}, hwids: {}, ips: {} }, 
      hwidResets: {},
      ipLogs: {},
      hwidChanges: {},
      panelMessages: {} 
    }, null, 2));
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!db.blacklist) db.blacklist = { users: {}, hwids: {}, ips: {} };
  if (!db.hwidResets) db.hwidResets = {};
  if (!db.ipLogs) db.ipLogs = {};
  if (!db.hwidChanges) db.hwidChanges = {};
  if (!db.panelMessages) db.panelMessages = {};
  return db;
}
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function loadCFG() {
  if (!fs.existsSync(CFG_PATH))
    fs.writeFileSync(CFG_PATH, JSON.stringify({ 
      keyRoleId: null, 
      buyerRoleId: null, 
      ownerRoleId: null,
      panelChannelId: null, 
      downloadUrlRoblox: null,
      downloadUrlDice: null,
      webhookUrl: null,
      autoCleanup: true,
      maxHwidChanges: 3,
      ticketChannelId: null
    }, null, 2));
  const cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
  if (!cfg.ownerRoleId) cfg.ownerRoleId = null;
  if (!cfg.downloadUrlRoblox) cfg.downloadUrlRoblox = null;
  if (!cfg.downloadUrlDice) cfg.downloadUrlDice = null;
  if (!cfg.webhookUrl) cfg.webhookUrl = null;
  if (cfg.autoCleanup === undefined) cfg.autoCleanup = true;
  if (!cfg.maxHwidChanges) cfg.maxHwidChanges = 5;
  if (!cfg.ticketChannelId) cfg.ticketChannelId = null;
  return cfg;
}
function saveCFG(cfg) { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); }

// ── Webhook logger ────────────────────────────────────────────────────────────
async function logToWebhook(cfg, embed) {
  if (!cfg.webhookUrl) return;
  try {
    await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) {
    console.log("Webhook error:", e.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateKey(vip = false, product = "roblox") {
  const seg = () => uuidv4().replace(/-/g, "").toUpperCase().slice(0, 4);
  let prefix = "RBXG";
  if (vip) prefix = "VIP";
  else if (product === "dice") prefix = "DICE";
  return `${prefix}-${seg()}-${seg()}-${seg()}-${seg()}`;
}
function calcExpiry(duration) {
  if (!duration || duration.toLowerCase() === "permanent") return null;
  const m = duration.match(/^(\d+)(m|h|d)$/i);
  if (!m) return null;
  const ms = m[2].toLowerCase() === "m" ? m[1]*60000 : m[2].toLowerCase() === "h" ? m[1]*3600000 : m[1]*86400000;
  return new Date(Date.now() + ms).toISOString();
}
function addTime(existing, duration) {
  const m = duration.match(/^(\d+)(m|h|d)$/i);
  if (!m) return null;
  const ms = m[2].toLowerCase() === "m" ? m[1]*60000 : m[2].toLowerCase() === "h" ? m[1]*3600000 : m[1]*86400000;
  return new Date((existing ? new Date(existing).getTime() : Date.now()) + ms).toISOString();
}
function isExpired(k)   { return k.expiresAt ? Date.now() > new Date(k.expiresAt).getTime() : false; }
function isPaused(k)    { return k.paused === true; }
function validDuration(d) { return !d || d.toLowerCase() === "permanent" || /^\d+(m|h|d)$/i.test(d); }
function durationLabel(d) {
  if (!d || d.toLowerCase() === "permanent") return "Permanent ♾️";
  const m = d.match(/^(\d+)(m|h|d)$/i);
  if (!m) return d;
  const labels = { m: "minute", h: "hour", d: "day" };
  return `${m[1]} ${labels[m[2].toLowerCase()]}${parseInt(m[1]) !== 1 ? "s" : ""}`;
}
function expiryLine(e) {
  return e ? `⏳ **Expires:** <t:${Math.floor(new Date(e).getTime()/1000)}:R>` : `♾️ **Duration:** Permanent`;
}
function statusEmoji(k) {
  if (k.revoked)    return "🔴 Revoked";
  if (isExpired(k)) return "🟡 Expired";
  if (isPaused(k))  return "⏸️ Paused";
  if (k.vip)        return "👑 Active (VIP)";
  return "🟢 Active";
}

// ── Panel builder ─────────────────────────────────────────────────────────────
function buildPanel(cfg, product = "roblox") {
  const productName = product === "dice" ? "🎲 Dice Extension" : "🎁 Roblox Gift Extension";
  const productEmoji = product === "dice" ? "🎲" : "🎁";
  const keyPrefix = product === "dice" ? "DICE-" : "RBXG-";
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${productEmoji} ${productName} - Buyer Panel`)
    .setDescription(`Redeem your ${keyPrefix}XXXX key to unlock access.`)
    .addFields(
      { name: "🎟️ Redeem Key", value: `Enter your ${keyPrefix}XXXX key to get Buyer role`, inline: true },
      { name: "📥 Download", value: "Get the latest version of the extension", inline: true },
      { name: "🪪 My Key", value: "View your current activation key", inline: true },
      { name: "🔄 Reset HWID", value: "Reset hardware lock (1x/day)", inline: true },
    )
    .setFooter({ text: `${productName} • Redeem a key to unlock` });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`panel_redeem_${product}`).setLabel("🎟️ Redeem Key").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`panel_download_${product}`).setLabel("📥 Download").setStyle(ButtonStyle.Primary),
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`panel_mykey_${product}`).setLabel("🪪 My Key").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`panel_hwid_${product}`).setLabel("🔄 Reset HWID").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2], product };
}

// ── Command Definitions ───────────────────────────────────────────────────────
const adm = PermissionFlagsBits.Administrator;

const commands = [
  new SlashCommandBuilder().setName("mykey").setDescription("View your current key"),

  new SlashCommandBuilder().setName("addkey").setDescription("(Admin) Give a key to a user").setDefaultMemberPermissions(adm)
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("e.g. 30m 2h 7d permanent").setRequired(false))
    .addBooleanOption(o => o.setName("vip").setDescription("Make it a VIP key?").setRequired(false))
    .addStringOption(o => o.setName("product").setDescription("Product type").setRequired(false)
      .addChoices(
        { name: "Roblox (RBXG-)", value: "roblox" },
        { name: "Dice (DICE-)", value: "dice" }
      )),

  new SlashCommandBuilder().setName("bulkkey").setDescription("(Admin) Generate multiple keys").setDefaultMemberPermissions(adm)
    .addIntegerOption(o => o.setName("amount").setDescription("How many (max 20)").setRequired(true).setMinValue(1).setMaxValue(20))
    .addStringOption(o => o.setName("duration").setDescription("e.g. 30m 2h 7d permanent").setRequired(false))
    .addBooleanOption(o => o.setName("vip").setDescription("VIP keys?").setRequired(false))
    .addStringOption(o => o.setName("product").setDescription("Product type").setRequired(false)
      .addChoices(
        { name: "Roblox (RBXG-)", value: "roblox" },
        { name: "Dice (DICE-)", value: "dice" }
      )),

  new SlashCommandBuilder().setName("randomkey").setDescription("(Admin) Generate a random unassigned key").setDefaultMemberPermissions(adm)
    .addStringOption(o => o.setName("duration").setDescription("e.g. 30m 2h 7d permanent").setRequired(false))
    .addBooleanOption(o => o.setName("vip").setDescription("VIP key?").setRequired(false))
    .addStringOption(o => o.setName("product").setDescription("Product type").setRequired(false)
      .addChoices(
        { name: "Roblox (RBXG-)", value: "roblox" },
        { name: "Dice (DICE-)", value: "dice" }
      )),

  new SlashCommandBuilder().setName("extendkey").setDescription("(Admin) Extend a key's expiry").setDefaultMemberPermissions(adm)
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("How much to add e.g. 7d 2h").setRequired(true)),

  new SlashCommandBuilder().setName("pausekey").setDescription("(Admin) Pause a key").setDefaultMemberPermissions(adm)
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),

  new SlashCommandBuilder().setName("unpausekey").setDescription("(Admin) Unpause a key").setDefaultMemberPermissions(adm)
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),

  new SlashCommandBuilder().setName("revokekey").setDescription("(Admin) Revoke a user's key").setDefaultMemberPermissions(adm)
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),

  new SlashCommandBuilder().setName("resetkey").setDescription("(Admin) Wipe and reissue a key").setDefaultMemberPermissions(adm)
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("e.g. 30m 2h 7d permanent").setRequired(false)),

  new SlashCommandBuilder().setName("keyinfo").setDescription("(Admin) See key details for a user").setDefaultMemberPermissions(adm)
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),

  new SlashCommandBuilder().setName("findkey").setDescription("(Admin) Look up who owns a key").setDefaultMemberPermissions(adm)
    .addStringOption(o => o.setName("key").setDescription("The key").setRequired(true)),

  new SlashCommandBuilder().setName("listkeys").setDescription("(Admin) List all active keys").setDefaultMemberPermissions(adm),
  new SlashCommandBuilder().setName("clearexpired").setDescription("(Admin) Delete expired/revoked keys").setDefaultMemberPermissions(adm),
  new SlashCommandBuilder().setName("stats").setDescription("(Admin) Show bot statistics").setDefaultMemberPermissions(adm),
  
  new SlashCommandBuilder().setName("blacklist").setDescription("(Admin) Ban a user/HWID/IP").setDefaultMemberPermissions(adm)
    .addStringOption(o => o.setName("type").setDescription("What to ban").setRequired(true)
      .addChoices(
        { name: "User (Discord ID)", value: "user" },
        { name: "HWID", value: "hwid" },
        { name: "IP Address", value: "ip" }
      ))
    .addStringOption(o => o.setName("value").setDescription("User ID / HWID / IP").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Ban reason").setRequired(false)),
  
  new SlashCommandBuilder().setName("unblacklist").setDescription("(Admin) Remove from blacklist").setDefaultMemberPermissions(adm)
    .addStringOption(o => o.setName("type").setDescription("What to unban").setRequired(true)
      .addChoices(
        { name: "User (Discord ID)", value: "user" },
        { name: "HWID", value: "hwid" },
        { name: "IP Address", value: "ip" }
      ))
    .addStringOption(o => o.setName("value").setDescription("User ID / HWID / IP").setRequired(true)),
  
  new SlashCommandBuilder().setName("viewblacklist").setDescription("(Admin) View all banned users/HWIDs/IPs").setDefaultMemberPermissions(adm),
  
  new SlashCommandBuilder().setName("extendall").setDescription("(Admin) Extend all active keys").setDefaultMemberPermissions(adm)
    .addStringOption(o => o.setName("duration").setDescription("How much to add (e.g. 7d, 30d)").setRequired(true))
    .addStringOption(o => o.setName("product").setDescription("Which product keys").setRequired(false)
      .addChoices(
        { name: "All products", value: "all" },
        { name: "Roblox only", value: "roblox" },
        { name: "Dice only", value: "dice" }
      )),
  
  new SlashCommandBuilder().setName("setwebhook").setDescription("(Admin) Set webhook for key event logging").setDefaultMemberPermissions(adm)
    .addStringOption(o => o.setName("url").setDescription("Discord webhook URL").setRequired(true)),
  
  new SlashCommandBuilder().setName("ticketsetup").setDescription("(Admin) Setup support ticket system in this channel").setDefaultMemberPermissions(adm),

  new SlashCommandBuilder().setName("setuppanel").setDescription("(Admin) Post a buyer panel in this channel").setDefaultMemberPermissions(adm)
    .addStringOption(o => o.setName("product").setDescription("Which product panel").setRequired(true)
      .addChoices(
        { name: "🎁 Roblox Extension (RBXG-)", value: "roblox" },
        { name: "🎲 Dice Extension (DICE-)", value: "dice" }
      )),

  new SlashCommandBuilder().setName("setdownload").setDescription("(Admin) Set extension download URL").setDefaultMemberPermissions(adm)
    .addStringOption(o => o.setName("url").setDescription("Download URL").setRequired(true))
    .addStringOption(o => o.setName("product").setDescription("Which product").setRequired(true)
      .addChoices(
        { name: "🎁 Roblox Extension", value: "roblox" },
        { name: "🎲 Dice Extension", value: "dice" }
      )),

  new SlashCommandBuilder().setName("setrole").setDescription("(Admin) Set role given when someone gets a key").setDefaultMemberPermissions(adm)
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(false)),

  new SlashCommandBuilder().setName("setbuyerrole").setDescription("(Admin) Set the Buyer role for the panel").setDefaultMemberPermissions(adm)
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(false)),

  new SlashCommandBuilder().setName("setownerrole").setDescription("(Admin) Set the Owner role (required to use admin commands)").setDefaultMemberPermissions(adm)
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(false)),
];

// Auto-cleanup expired keys daily
setInterval(() => {
  const db = loadDB();
  let count = 0;
  for (const [k,v] of Object.entries(db.keys)) {
    if (v.revoked || isExpired(v)) { 
      if (v.userId && db.userMap[v.userId]===k) delete db.userMap[v.userId]; 
      delete db.keys[k]; 
      count++; 
    }
  }
  if (count > 0) {
    saveDB(db);
    console.log(`🗑️ Auto-cleaned ${count} expired keys`);
  }
}, 86400000); // 24 hours

// Auto-expiry warnings - check every hour
setInterval(async () => {
  const db = loadDB();
  const now = Date.now();
  const twentyFourHours = 86400000; // 24 hours in ms
  
  for (const [keyCode, kd] of Object.entries(db.keys)) {
    if (!kd.expiresAt || kd.revoked || kd.paused || !kd.userId) continue;
    
    const expiryTime = new Date(kd.expiresAt).getTime();
    const timeUntilExpiry = expiryTime - now;
    
    // If expires in 20-24 hours and warning not sent yet
    if (timeUntilExpiry > 0 && timeUntilExpiry <= twentyFourHours && !kd.expiryWarningSent) {
      try {
        const user = await client.users.fetch(kd.userId);
        const productName = kd.product === "dice" ? "🎲 Dice Extension" : "🎁 Roblox Gift Extension";
        const hoursLeft = Math.floor(timeUntilExpiry / 3600000);
        
        await user.send({
          embeds: [new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle("⚠️ Key Expiring Soon!")
            .setDescription(
              `Your **${productName}** key is expiring in **~${hoursLeft} hours**!\n\n` +
              `**Key:** \`${keyCode}\`\n` +
              `**Expires:** <t:${Math.floor(expiryTime/1000)}:F>\n\n` +
              `Contact the server owner to renew your key and keep using the extension.`
            )
            .setFooter({ text: "Don't lose access!" })
            .setTimestamp()]
        });
        
        kd.expiryWarningSent = true;
        saveDB(db);
        console.log(`⚠️ Sent expiry warning to ${kd.username} (${hoursLeft}h left)`);
      } catch (e) {
        console.log(`Failed to send expiry warning to ${kd.username}: ${e.message}`);
      }
    }
  }
}, 3600000); // Check every hour

// ── Auto-Deploy Function ──────────────────────────────────────────────────────
async function deployCommands() {
  try {
    console.log("🔄 Registering slash commands...");
    const rest = new REST({ version: "10" }).setToken(CONFIG.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID), 
      { body: commands.map(c => c.toJSON()) }
    );
    console.log("✅ Slash commands registered successfully!");
    return true;
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
    return false;
  }
}

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once("ready", async () => {
  console.log(`✅ Key bot ready as ${client.user.tag}`);
  
  // Auto-deploy commands if enabled
  if (CONFIG.AUTO_DEPLOY) {
    await deployCommands();
  }
});

// ── Button interactions ───────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    const cfg = loadCFG();
    const db  = loadDB();
    
    // Extract product from button ID (e.g., panel_redeem_roblox -> roblox)
    const buttonId = interaction.customId;
    const product = buttonId.includes("_dice") ? "dice" : "roblox";
    const baseAction = buttonId.replace("_roblox", "").replace("_dice", "");

    // 🎟️ Redeem Key (ANYONE can click this)
    if (baseAction === "panel_redeem") {
      const keyPrefix = product === "dice" ? "DICE" : "RBXG";
      const productName = product === "dice" ? "Dice Extension" : "Roblox Gift Extension";
      
      const modal = new ModalBuilder()
        .setCustomId(`redeem_modal_${product}`)
        .setTitle(`🎟️ Redeem Your ${productName} Key`);

      const keyInput = new TextInputBuilder()
        .setCustomId("key_input")
        .setLabel(`Enter your key (e.g., ${keyPrefix}-XXXX-XXXX-XXXX)`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`${keyPrefix}-XXXX-XXXX-XXXX`)
        .setRequired(true)
        .setMaxLength(50);

      const row = new ActionRowBuilder().addComponents(keyInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return;
    }

    // Check buyer role for other buttons
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasBuyerRole = cfg.buyerRoleId ? member?.roles.cache.has(cfg.buyerRoleId) : true;
    
    if (!hasBuyerRole && baseAction !== "panel_redeem") {
      await interaction.reply({ 
        content: "❌ You need to redeem a key first! Click the 🎟️ **Redeem Key** button.", 
        ephemeral: true 
      });
      return;
    }

    // 📥 Download
    if (baseAction === "panel_download") {
      const downloadField = product === "dice" ? "downloadUrlDice" : "downloadUrlRoblox";
      if (!cfg[downloadField]) {
        await interaction.reply({ 
          content: "❌ No download link configured. Contact an admin.", 
          ephemeral: true 
        });
        return;
      }
      const productName = product === "dice" ? "Dice Extension" : "Roblox Gift Extension";
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(`📥 Download ${productName}`)
          .setDescription(`[**Click here to download the latest version**](${cfg[downloadField]})\n\n⚠️ Make sure to extract and follow the installation instructions in the README.`)
          .setFooter({ text: "Save your key in a secure location" })],
        ephemeral: true,
      });
    }

    // 🪪 My Key
    else if (baseAction === "panel_mykey") {
      const key = db.userMap[interaction.user.id];
      if (!key) {
        await interaction.reply({ 
          content: "You don't have a key yet. Use `/getkey` in the server.", 
          ephemeral: true 
        });
        return;
      }
      const kd = db.keys[key];
      const exp = kd.expiresAt
        ? `<t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:F> (<t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:R>)`
        : "Never ♾️";
      
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(kd.vip ? 0xF1C40F : (!kd.revoked && !isExpired(kd) && !isPaused(kd) ? 0x57F287 : 0xED4245))
          .setTitle(`${kd.vip ? "👑 VIP " : ""}🔑 Your Key`)
          .addFields(
            { name: "Key", value: `\`\`\`\n${key}\n\`\`\`` },
            { name: "Status", value: statusEmoji(kd), inline: true },
            { name: "HWID Locked", value: kd.hwid ? "✅ Yes" : "⏳ Not yet", inline: true },
            { name: "Expires", value: exp },
            { name: "Issued", value: `<t:${Math.floor(new Date(kd.createdAt).getTime()/1000)}:F>`, inline: true },
          )
          .setFooter({ text: "⚠️ Do not share your key" })],
        ephemeral: true,
      });
    }

    // 🔄 Reset HWID
    else if (baseAction === "panel_hwid") {
      const key = db.userMap[interaction.user.id];
      if (!key) {
        await interaction.reply({ 
          content: "You don't have a key. Use `/getkey` first.", 
          ephemeral: true 
        });
        return;
      }
      
      const kd = db.keys[key];
      if (!kd.hwid) {
        await interaction.reply({ 
          content: "Your key has no HWID bound yet — nothing to reset!", 
          ephemeral: true 
        });
        return;
      }

      // Check 1/day limit
      const today      = new Date().toDateString();
      const lastReset  = db.hwidResets[interaction.user.id];
      if (lastReset && new Date(lastReset).toDateString() === today) {
        const tomorrow = new Date(); 
        tomorrow.setHours(24, 0, 0, 0);
        await interaction.reply({
          content: `❌ You've already reset your HWID today. You can reset again <t:${Math.floor(tomorrow.getTime()/1000)}:R>.`,
          ephemeral: true,
        });
        return;
      }

      kd.hwid = null;
      db.hwidResets[interaction.user.id] = new Date().toISOString();
      saveDB(db);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("🔄 HWID Reset Successful")
          .setDescription(
            "Your hardware ID has been cleared! The next device that uses your key will be bound to it.\n\n" +
            "⚠️ **Important:** You can only reset once per day. Use this wisely!"
          )
          .addFields(
            { name: "Next Reset Available", value: `<t:${Math.floor((Date.now() + 86400000)/1000)}:R>`, inline: false }
          )],
        ephemeral: true,
      });
    }
    return;
  }

  // ── Modal submissions ──────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    // Extract product from modal ID (e.g., redeem_modal_roblox -> roblox)
    const modalId = interaction.customId;
    const product = modalId.includes("_dice") ? "dice" : "roblox";
    
    if (modalId.startsWith("redeem_modal")) {
      const cfg = loadCFG();
      const db = loadDB();
      
      const keyInput = interaction.fields.getTextInputValue("key_input").trim().toUpperCase();
      const kd = db.keys[keyInput];
      
      // Check if key exists
      if (!kd) {
        await interaction.reply({
          content: "❌ **Invalid key!** This key doesn't exist. Contact an admin if you believe this is an error.",
          ephemeral: true
        });
        return;
      }
      
      // Check if key matches product
      const keyProduct = keyInput.startsWith("DICE-") ? "dice" : "roblox";
      if (keyProduct !== product) {
        const wrongProduct = product === "dice" ? "Roblox (RBXG-)" : "Dice (DICE-)";
        const correctPanel = product === "dice" ? "Dice" : "Roblox";
        await interaction.reply({
          content: `❌ **Wrong panel!** This is a ${wrongProduct} key. Use it on the ${correctPanel} panel instead.`,
          ephemeral: true
        });
        return;
      }
      
      // Check if key is revoked
      if (kd.revoked) {
        await interaction.reply({
          content: "❌ **Key revoked!** This key has been disabled. Contact an admin.",
          ephemeral: true
        });
        return;
      }
      
      // Check if key is expired
      if (isExpired(kd)) {
        await interaction.reply({
          content: "❌ **Key expired!** This key is no longer valid. Contact an admin to get a new one.",
          ephemeral: true
        });
        return;
      }
      
      // Check if key is paused
      if (isPaused(kd)) {
        await interaction.reply({
          content: "❌ **Key paused!** This key is temporarily disabled. Contact an admin.",
          ephemeral: true
        });
        return;
      }
      
      // Check if key is already assigned to someone else
      if (kd.userId && kd.userId !== interaction.user.id) {
        await interaction.reply({
          content: "❌ **Key already in use!** This key is registered to another user.",
          ephemeral: true
        });
        return;
      }
      
      // Assign key to user if not already assigned
      if (!kd.userId) {
        kd.userId = interaction.user.id;
        kd.username = interaction.user.tag;
        db.userMap[interaction.user.id] = keyInput;
        db.leaderboard.push({ 
          userId: interaction.user.id, 
          username: interaction.user.tag, 
          issuedAt: new Date().toISOString(), 
          vip: kd.vip 
        });
        saveDB(db);
      }
      
      // Give Buyer role
      if (cfg.buyerRoleId) {
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(cfg.buyerRoleId);
        } catch (e) {
          console.log(`Could not add Buyer role to ${interaction.user.tag}`);
        }
      }
      
      // Give Key role if enabled
      if (cfg.keyRoleId && cfg.autoRoleEnabled) {
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(cfg.keyRoleId);
        } catch (e) {
          console.log(`Could not add Key role to ${interaction.user.tag}`);
        }
      }
      
      const exp = kd.expiresAt 
        ? `<t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:R>`
        : "Never ♾️";
      
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(kd.vip ? 0xF1C40F : 0x57F287)
          .setTitle(`${kd.vip ? "👑 VIP " : ""}✅ Key Redeemed Successfully!`)
          .setDescription(
            `You now have access to the extension!\n\n` +
            `**Your Key:** \`${keyInput}\`\n` +
            `**Status:** ${statusEmoji(kd)}\n` +
            `**Expires:** ${exp}\n\n` +
            `Use the panel buttons below to download the extension and manage your key.`
          )
          .setFooter({ text: "⚠️ Keep your key private" })],
        ephemeral: true
      });
    }
    return;
  }

  // ── Slash commands ─────────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, user } = interaction;
  const db  = loadDB();
  const cfg = loadCFG();

  // ALL commands require owner role (except help and setownerrole which we allow for Discord admins)
  if (commandName !== "help" && commandName !== "setownerrole") {
    // Check for owner role
    if (!cfg.ownerRoleId) {
      await interaction.reply({
        content: "❌ Owner role not set! A Discord admin must run: `/setownerrole @role`",
        ephemeral: true
      });
      return;
    }
    
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const hasOwnerRole = member?.roles.cache.has(cfg.ownerRoleId);
    
    if (!hasOwnerRole) {
      await interaction.reply({
        content: "❌ You need the **Owner** role to use bot commands.\n\nUse the 🎟️ **Redeem Key** button on the panel to activate your key.",
        ephemeral: true
      });
      return;
    }
  }

  // /mykey
  else if (commandName === "mykey") {
    const key = db.userMap[user.id];
    if (!key) { 
      await interaction.reply({ 
        content: "No key yet. Use `/getkey` to request one.", 
        ephemeral: true 
      }); 
      return; 
    }
    const kd = db.keys[key];
    const exp = kd.expiresAt 
      ? `<t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:F> (<t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:R>)` 
      : "Never ♾️";
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(kd.vip ? 0xF1C40F : (!kd.revoked && !isExpired(kd) && !isPaused(kd) ? 0x57F287 : 0xED4245))
        .setTitle(`${kd.vip?"👑 VIP ":""}🔑 Your Key`)
        .addFields(
          { name: "Key", value: `\`\`\`\n${key}\n\`\`\`` },
          { name: "Status", value: statusEmoji(kd), inline: true },
          { name: "HWID Locked", value: kd.hwid?"✅ Yes":"⏳ Not yet", inline: true },
          { name: "Expires", value: exp },
          { name: "Issued", value: `<t:${Math.floor(new Date(kd.createdAt).getTime()/1000)}:R>`, inline: true }
        )
        .setFooter({ text: "⚠️ Keep this key private" })],
      ephemeral: true,
    });
  }

  // /addkey
  else if (commandName === "addkey") {
    const targetUser = interaction.options.getUser("user");
    const duration   = interaction.options.getString("duration") || "permanent";
    const vip        = interaction.options.getBoolean("vip") || false;
    const product    = interaction.options.getString("product") || "roblox";
    
    if (!validDuration(duration)) { 
      await interaction.reply({ 
        content: "❌ Invalid duration.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    if (db.userMap[targetUser.id]) {
      const ex = db.keys[db.userMap[targetUser.id]];
      if (!isExpired(ex) && !ex.revoked) { 
        await interaction.reply({ 
          content: `${targetUser.tag} already has a key: \`${db.userMap[targetUser.id]}\``, 
          ephemeral: true 
        }); 
        return; 
      }
      delete db.userMap[targetUser.id];
    }
    
    // Defer reply to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    const newKey = generateKey(vip, product);
    const expiresAt = calcExpiry(duration);
    const now = new Date().toISOString();
    db.keys[newKey] = { 
      userId: targetUser.id, 
      username: targetUser.tag, 
      createdAt: now, 
      expiresAt, 
      hwid: null, 
      revoked: false, 
      paused: false, 
      vip,
      product
    };
    db.userMap[targetUser.id] = newKey;
    if (!db.leaderboard) db.leaderboard = [];
    db.leaderboard.push({ userId: targetUser.id, username: targetUser.tag, issuedAt: now, vip });
    saveDB(db);
    
    if (cfg.keyRoleId) { 
      try { 
        const m = await interaction.guild.members.fetch(targetUser.id); 
        await m.roles.add(cfg.keyRoleId); 
      } catch {} 
    }
    
    const productName = product === "dice" ? "Dice Extension" : "Roblox Gift Extension";
    try { 
      await targetUser.send(`${vip?"👑 **VIP ":"🔑 **"}${productName} Key**\n\`\`\`\n${newKey}\n\`\`\`\n${expiryLine(expiresAt)}\nPaste into the extension popup.`); 
    } catch {}
    
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(vip?0xF1C40F:0x57F287)
        .setTitle(`${vip?"👑 VIP ":""}✅ Key Issued`)
        .addFields(
          { name: "User", value: targetUser.tag, inline: true },
          { name: "Type", value: vip?"👑 VIP":"Standard", inline: true },
          { name: "Duration", value: durationLabel(duration), inline: true },
          { name: "Key", value: `\`${newKey}\`` }
        )],
    });
  }

  // /bulkkey
  else if (commandName === "bulkkey") {
    const amount   = Math.min(interaction.options.getInteger("amount"), 20);
    const duration = interaction.options.getString("duration") || "permanent";
    const vip      = interaction.options.getBoolean("vip") || false;
    const product  = interaction.options.getString("product") || "roblox";
    
    if (!validDuration(duration)) { 
      await interaction.reply({ 
        content: "❌ Invalid duration.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    const keys = [];
    const expiresAt = calcExpiry(duration);
    
    for (let i = 0; i < amount; i++) {
      const k = generateKey(vip, product);
      db.keys[k] = { 
        userId: null, 
        username: "Unassigned", 
        createdAt: new Date().toISOString(), 
        expiresAt, 
        hwid: null, 
        revoked: false, 
        paused: false, 
        vip,
        product
      };
      keys.push(k);
    }
    
    saveDB(db);
    
    const productName = product === "dice" ? "Dice" : "Roblox";
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(vip?0xF1C40F:0x57F287)
        .setTitle(`${vip?"👑 VIP ":""}📦 ${amount} ${productName} Keys Generated`)
        .setDescription(`\`\`\`\n${keys.join("\n")}\n\`\`\``)
        .addFields(
          { name: "Product", value: productName, inline: true },
          { name: "Type", value: vip?"👑 VIP":"Standard", inline: true },
          { name: "Duration", value: durationLabel(duration), inline: true }
        )],
    });
  }

  // /randomkey
  else if (commandName === "randomkey") {
    const duration = interaction.options.getString("duration") || "permanent";
    const vip      = interaction.options.getBoolean("vip") || false;
    const product  = interaction.options.getString("product") || "roblox";
    
    if (!validDuration(duration)) { 
      await interaction.reply({ 
        content: "❌ Invalid duration.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    const k = generateKey(vip, product);
    const expiresAt = calcExpiry(duration);
    db.keys[k] = { 
      userId: null, 
      username: "Unassigned", 
      createdAt: new Date().toISOString(), 
      expiresAt, 
      hwid: null, 
      revoked: false, 
      paused: false, 
      vip,
      product
    };
    saveDB(db);
    
    const productName = product === "dice" ? "Dice" : "Roblox";
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(vip?0xF1C40F:0xFEE75C)
        .setTitle(`${vip?"👑 VIP ":""}🎲 Random ${productName} Key`)
        .addFields(
          { name: "Key", value: `\`${k}\`` },
          { name: "Product", value: productName, inline: true },
          { name: "Type", value: vip?"👑 VIP":"Standard", inline: true },
          { name: "Duration", value: durationLabel(duration), inline: true }
        )],
      ephemeral: true,
    });
  }

  // /extendkey
  else if (commandName === "extendkey") {
    const targetUser = interaction.options.getUser("user");
    const duration   = interaction.options.getString("duration");
    
    if (!duration?.match(/^\d+(m|h|d)$/i)) { 
      await interaction.reply({ 
        content: "❌ Invalid duration.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    const key = db.userMap[targetUser.id];
    if (!key) { 
      await interaction.reply({ 
        content: `${targetUser.tag} has no key.`, 
        ephemeral: true 
      }); 
      return; 
    }
    
    const kd = db.keys[key];
    if (kd.revoked) { 
      await interaction.reply({ 
        content: "Key is revoked.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    const oldExpiry = kd.expiresAt;
    kd.expiresAt = addTime(oldExpiry, duration);
    saveDB(db);
    
    try { 
      await targetUser.send(
        `⏩ **Your key has been extended!**\n` +
        `Extended by: **${durationLabel(duration)}**\n` +
        `New expiry: <t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:F>`
      ); 
    } catch {}
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("⏩ Key Extended")
        .addFields(
          { name: "User", value: targetUser.tag, inline: true },
          { name: "Extended By", value: durationLabel(duration), inline: true },
          { name: "Old Expiry", value: oldExpiry ? `<t:${Math.floor(new Date(oldExpiry).getTime()/1000)}:F>` : "Was permanent", inline: true },
          { name: "New Expiry", value: `<t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:F>`, inline: true }
        )],
      ephemeral: true,
    });
  }

  // /pausekey
  else if (commandName === "pausekey") {
    const targetUser = interaction.options.getUser("user");
    const key = db.userMap[targetUser.id];
    
    if (!key) { 
      await interaction.reply({ 
        content: `${targetUser.tag} has no key.`, 
        ephemeral: true 
      }); 
      return; 
    }
    
    if (db.keys[key].paused) { 
      await interaction.reply({ 
        content: "Already paused.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    db.keys[key].paused = true;
    saveDB(db);
    
    try { 
      await targetUser.send("⏸️ Your extension key has been **paused** by an admin."); 
    } catch {}
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle("⏸️ Key Paused")
        .setDescription(`**${targetUser.tag}'s** key paused.`)],
      ephemeral: true
    });
  }

  // /unpausekey
  else if (commandName === "unpausekey") {
    const targetUser = interaction.options.getUser("user");
    const key = db.userMap[targetUser.id];
    
    if (!key) { 
      await interaction.reply({ 
        content: `${targetUser.tag} has no key.`, 
        ephemeral: true 
      }); 
      return; 
    }
    
    if (!db.keys[key].paused) { 
      await interaction.reply({ 
        content: "Key isn't paused.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    db.keys[key].paused = false;
    saveDB(db);
    
    try { 
      await targetUser.send("▶️ Your extension key has been **unpaused**! You're good to go."); 
    } catch {}
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("▶️ Key Unpaused")
        .setDescription(`**${targetUser.tag}'s** key is active again.`)],
      ephemeral: true
    });
  }

  // /revokekey
  else if (commandName === "revokekey") {
    const targetUser = interaction.options.getUser("user");
    const key = db.userMap[targetUser.id];
    
    if (!key) { 
      await interaction.reply({ 
        content: `${targetUser.tag} has no key.`, 
        ephemeral: true 
      }); 
      return; 
    }
    
    db.keys[key].revoked = true;
    delete db.userMap[targetUser.id];
    saveDB(db);
    
    if (cfg.keyRoleId) { 
      try { 
        const m = await interaction.guild.members.fetch(targetUser.id); 
        await m.roles.remove(cfg.keyRoleId); 
      } catch {} 
    }
    
    try { 
      await targetUser.send("🔴 Your extension key has been **revoked**. Contact an admin if this was a mistake."); 
    } catch {}
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("🚫 Key Revoked")
        .setDescription(`**${targetUser.tag}'s** key revoked.`)],
      ephemeral: false
    });
  }

  // /resetkey
  else if (commandName === "resetkey") {
    const targetUser = interaction.options.getUser("user");
    const duration   = interaction.options.getString("duration") || "permanent";
    const vip        = db.userMap[targetUser.id] ? (db.keys[db.userMap[targetUser.id]]?.vip || false) : false;
    
    if (!validDuration(duration)) { 
      await interaction.reply({ 
        content: "❌ Invalid duration.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    if (db.userMap[targetUser.id]) { 
      db.keys[db.userMap[targetUser.id]].revoked = true; 
      delete db.userMap[targetUser.id]; 
    }
    
    const newKey = generateKey(vip);
    const expiresAt = calcExpiry(duration);
    db.keys[newKey] = { 
      userId: targetUser.id, 
      username: targetUser.tag, 
      createdAt: new Date().toISOString(), 
      expiresAt, 
      hwid: null, 
      revoked: false, 
      paused: false, 
      vip 
    };
    db.userMap[targetUser.id] = newKey;
    saveDB(db);
    
    try { 
      await targetUser.send(
        `🔄 **Key reset!**\n\`\`\`\n${newKey}\n\`\`\`\n${expiryLine(expiresAt)}\nOld key revoked.`
      ); 
    } catch {}
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle("🔄 Key Reset")
        .addFields(
          { name: "New Key", value: `\`${newKey}\`` },
          { name: "Duration", value: durationLabel(duration), inline: true }
        )],
      ephemeral: true,
    });
  }

  // /keyinfo
  else if (commandName === "keyinfo") {
    const targetUser = interaction.options.getUser("user");
    const key = db.userMap[targetUser.id];
    
    if (!key) { 
      await interaction.reply({ 
        content: `${targetUser.tag} has no key.`, 
        ephemeral: true 
      }); 
      return; 
    }
    
    const kd = db.keys[key];
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔍 Key Info — ${targetUser.tag}`)
        .addFields(
          { name: "Key", value: `\`${key}\`` },
          { name: "Status", value: statusEmoji(kd), inline: true },
          { name: "Type", value: kd.vip?"👑 VIP":"Standard", inline: true },
          { name: "HWID", value: kd.hwid?`\`${kd.hwid}\``:"Not bound" },
          { name: "Expires", value: kd.expiresAt?`<t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:F>`:"Never ♾️", inline: true },
          { name: "Issued", value: `<t:${Math.floor(new Date(kd.createdAt).getTime()/1000)}:F>`, inline: true }
        )],
      ephemeral: true,
    });
  }

  // /findkey
  else if (commandName === "findkey") {
    const keyInput = (interaction.options.getString("key") || "").trim().toUpperCase();
    const kd = db.keys[keyInput];
    
    if (!kd) { 
      await interaction.reply({ 
        content: `❌ Key not found.`, 
        ephemeral: true 
      }); 
      return; 
    }
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🔎 Key Lookup")
        .addFields(
          { name: "Key", value: `\`${keyInput}\`` },
          { name: "Owner", value: kd.userId?`<@${kd.userId}> (${kd.username})`:"Unassigned", inline: true },
          { name: "Status", value: statusEmoji(kd), inline: true },
          { name: "Type", value: kd.vip?"👑 VIP":"Standard", inline: true },
          { name: "HWID", value: kd.hwid?`\`${kd.hwid}\``:"None", inline: true },
          { name: "Expires", value: kd.expiresAt?`<t:${Math.floor(new Date(kd.expiresAt).getTime()/1000)}:R>`:"Never ♾️", inline: true }
        )],
      ephemeral: true,
    });
  }

  // /listkeys
  else if (commandName === "listkeys") {
    const active = Object.entries(db.keys).filter(([,v]) => !v.revoked && !isExpired(v));
    
    if (!active.length) { 
      await interaction.reply({ 
        content: "No active keys.", 
        ephemeral: true 
      }); 
      return; 
    }
    
    const lines = active.map(([k,v]) => {
      const exp = v.expiresAt?`expires <t:${Math.floor(new Date(v.expiresAt).getTime()/1000)}:R>`:"permanent";
      return `\`${k}\`${v.vip?" 👑":""}${v.paused?" ⏸️":""} — ${v.username} — ${exp}`;
    });
    
    const chunks = [];
    for (let i = 0; i < lines.length; i += 10) chunks.push(lines.slice(i,i+10).join("\n"));
    
    await interaction.reply({ 
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📋 Active Keys (${active.length})`)
        .setDescription(chunks[0])], 
      ephemeral: true 
    });
    for (let i = 1; i < chunks.length; i++) await interaction.followUp({ content: chunks[i], ephemeral: true });
  }

  // /clearexpired
  else if (commandName === "clearexpired") {
    let count = 0;
    for (const [k,v] of Object.entries(db.keys)) {
      if (v.revoked || isExpired(v)) { 
        if (v.userId && db.userMap[v.userId]===k) delete db.userMap[v.userId]; 
        delete db.keys[k]; 
        count++; 
      }
    }
    saveDB(db);
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("🗑️ Cleanup")
        .setDescription(`Removed **${count}** expired/revoked keys.`)],
      ephemeral: true
    });
  }

  // /stats
  else if (commandName === "stats") {
    const all = Object.values(db.keys);
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("📊 Stats")
        .addFields(
          { name: "🟢 Active",    value: `${all.filter(k=>!k.revoked&&!isExpired(k)&&!k.paused).length}`, inline: true },
          { name: "⏸️ Paused",   value: `${all.filter(k=>k.paused).length}`, inline: true },
          { name: "🟡 Expired",  value: `${all.filter(k=>!k.revoked&&isExpired(k)).length}`, inline: true },
          { name: "🔴 Revoked",  value: `${all.filter(k=>k.revoked).length}`, inline: true },
          { name: "👑 VIP",      value: `${all.filter(k=>k.vip&&!k.revoked).length}`, inline: true },
          { name: "🔒 HWID Bound",value:`${all.filter(k=>k.hwid).length}`, inline: true },
          { name: "📦 Total",    value: `${all.length}`, inline: true },
          { name: "🏓 Latency",  value: `${Math.round(client.ws.ping)}ms`, inline: true },
        )
        .setTimestamp()],
      ephemeral: true,
    });
  }

  // /setuppanel
  else if (commandName === "setuppanel") {
    const product = interaction.options.getString("product");
    const panel = buildPanel(cfg, product);
    const msg = await interaction.channel.send(panel);
    
    // Store panel message ID with product
    if (!cfg.panelMessages) cfg.panelMessages = {};
    cfg.panelMessages[product] = msg.id;
    saveCFG(cfg);
    
    const productName = product === "dice" ? "🎲 Dice Extension" : "🎁 Roblox Extension";
    await interaction.reply({ 
      content: `✅ ${productName} buyer panel posted!`, 
      ephemeral: true 
    });
  }

  // /setdownload
  else if (commandName === "setdownload") {
    const url = interaction.options.getString("url");
    const product = interaction.options.getString("product");
    const field = product === "dice" ? "downloadUrlDice" : "downloadUrlRoblox";
    cfg[field] = url;
    saveCFG(cfg);
    const productName = product === "dice" ? "🎲 Dice Extension" : "🎁 Roblox Extension";
    await interaction.reply({ 
      content: `✅ ${productName} download URL set to:\n${url}`, 
      ephemeral: true 
    });
  }

  // /setrole
  else if (commandName === "setrole") {
    const role = interaction.options.getRole("role");
    cfg.keyRoleId = role?.id || null;
    saveCFG(cfg);
    await interaction.reply({ 
      content: role ? `✅ Key role set to **${role.name}**` : "✅ Key role cleared.", 
      ephemeral: true 
    });
  }

  // /setbuyerrole
  else if (commandName === "setbuyerrole") {
    const role = interaction.options.getRole("role");
    cfg.buyerRoleId = role?.id || null;
    saveCFG(cfg);
    await interaction.reply({ 
      content: role ? `✅ Buyer role set to **${role.name}**` : "✅ Buyer role cleared.", 
      ephemeral: true 
    });
  }

  // /blacklist
  else if (commandName === "blacklist") {
    const type = interaction.options.getString("type");
    const value = interaction.options.getString("value");
    const reason = interaction.options.getString("reason") || "No reason provided";
    
    if (!db.blacklist[type + "s"]) db.blacklist[type + "s"] = {};
    db.blacklist[type + "s"][value] = { reason, bannedAt: new Date().toISOString(), bannedBy: interaction.user.id };
    saveDB(db);
    
    const typeLabel = type === "user" ? "User" : type === "hwid" ? "HWID" : "IP";
    await interaction.reply({
      content: `✅ **${typeLabel} Banned**\n\`\`\`\n${value}\n\`\`\`\nReason: ${reason}`,
      ephemeral: true
    });
    
    await logToWebhook(cfg, {
      title: "🔨 Blacklist Added",
      color: 0xED4245,
      fields: [
        { name: "Type", value: typeLabel, inline: true },
        { name: "Value", value: `\`${value}\``, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Banned By", value: `<@${interaction.user.id}>`, inline: true }
      ],
      timestamp: new Date().toISOString()
    });
  }
  
  // /unblacklist
  else if (commandName === "unblacklist") {
    const type = interaction.options.getString("type");
    const value = interaction.options.getString("value");
    
    if (db.blacklist[type + "s"]?.[value]) {
      delete db.blacklist[type + "s"][value];
      saveDB(db);
      await interaction.reply({ content: `✅ Removed from blacklist: \`${value}\``, ephemeral: true });
    } else {
      await interaction.reply({ content: `❌ Not found in blacklist.`, ephemeral: true });
    }
  }
  
  // /viewblacklist
  else if (commandName === "viewblacklist") {
    const users = Object.keys(db.blacklist.users || {});
    const hwids = Object.keys(db.blacklist.hwids || {});
    const ips = Object.keys(db.blacklist.ips || {});
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("🔨 Blacklist")
        .addFields(
          { name: "👤 Users", value: users.length ? users.map(u => `<@${u}>`).join(", ") : "None", inline: false },
          { name: "💻 HWIDs", value: hwids.length ? hwids.map(h => `\`${h.slice(0,16)}...\``).join(", ") : "None", inline: false },
          { name: "🌐 IPs", value: ips.length ? ips.map(ip => `\`${ip}\``).join(", ") : "None", inline: false }
        )],
      ephemeral: true
    });
  }
  
  // /extendall
  else if (commandName === "extendall") {
    const duration = interaction.options.getString("duration");
    const product = interaction.options.getString("product") || "all";
    
    if (!duration.match(/^\d+(d)$/i)) {
      await interaction.reply({ content: "❌ Invalid duration. Use format like: 7d, 30d", ephemeral: true });
      return;
    }
    
    const days = parseInt(duration);
    let count = 0;
    
    for (const [k, v] of Object.entries(db.keys)) {
      if (v.revoked || isExpired(v) || isPaused(v)) continue;
      if (product !== "all" && v.product !== product) continue;
      
      if (v.expiresAt) {
        const currentExpiry = new Date(v.expiresAt);
        currentExpiry.setDate(currentExpiry.getDate() + days);
        v.expiresAt = currentExpiry.toISOString();
      }
      count++;
    }
    
    saveDB(db);
    const productLabel = product === "all" ? "All" : product === "dice" ? "Dice" : "Roblox";
    await interaction.reply({
      content: `✅ Extended **${count}** ${productLabel} keys by **${days} days**.`,
      ephemeral: true
    });
    
    await logToWebhook(cfg, {
      title: "⏩ Bulk Key Extension",
      color: 0x5865F2,
      fields: [
        { name: "Keys Extended", value: `${count}`, inline: true },
        { name: "Duration Added", value: `${days} days`, inline: true },
        { name: "Product", value: productLabel, inline: true },
        { name: "Extended By", value: `<@${interaction.user.id}>`, inline: true }
      ],
      timestamp: new Date().toISOString()
    });
  }
  
  // /setwebhook
  else if (commandName === "setwebhook") {
    cfg.webhookUrl = interaction.options.getString("url");
    saveCFG(cfg);
    await interaction.reply({ content: `✅ Webhook URL set. All key events will be logged.`, ephemeral: true });
  }
  
  // /ticketsetup
  else if (commandName === "ticketsetup") {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("🎫 Support Tickets")
      .setDescription("Need help with your key? Click below to create a support ticket.\n\n**Common reasons:**\n• HWID reset needed\n• Key not working\n• Extension issues");
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("create_ticket").setLabel("🎫 Create Ticket").setStyle(ButtonStyle.Primary)
    );
    
    await interaction.channel.send({ embeds: [embed], components: [row] });
    cfg.ticketChannelId = interaction.channel.id;
    saveCFG(cfg);
    await interaction.reply({ content: "✅ Ticket system set up!", ephemeral: true });
  }

  // /setownerrole
  else if (commandName === "setownerrole") {
    const role = interaction.options.getRole("role");
    cfg.ownerRoleId = role?.id || null;
    saveCFG(cfg);
    await interaction.reply({ 
      content: role ? `✅ Owner role set to **${role.name}**\n\nOnly users with this role can use admin commands.` : "✅ Owner role cleared.", 
      ephemeral: true 
    });
  }

});

// ── HTTP API ──────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") { 
    res.writeHead(204); 
    res.end(); 
    return; 
  }
  
  if (req.method === "POST" && req.url === "/api/public/keys/validate") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { key, hwid } = JSON.parse(body);
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
        
        if (key === "__ping__") { 
          res.writeHead(200); 
          res.end(JSON.stringify({ valid: true })); 
          return; 
        }
        
        const db = loadDB();
        const cfg = loadCFG();
        const nk = (key||"").trim().toUpperCase();
        const kd = db.keys[nk];
        
        // Check IP blacklist
        if (db.blacklist.ips[clientIp]) {
          res.writeHead(403);
          res.end(JSON.stringify({ 
            valid: false, 
            reason: "ip_banned",
            message: db.blacklist.ips[clientIp].reason || "Your IP is banned"
          }));
          return;
        }
        
        // Check HWID blacklist
        if (hwid && db.blacklist.hwids[hwid]) {
          res.writeHead(403);
          res.end(JSON.stringify({ 
            valid: false, 
            reason: "hwid_banned",
            message: db.blacklist.hwids[hwid].reason || "Your device is banned"
          }));
          return;
        }
        
        if (!kd || kd.revoked) { 
          res.writeHead(200); 
          res.end(JSON.stringify({ 
            valid: false, 
            reason: kd?.revoked?"revoked":"not_found" 
          })); 
          return; 
        }
        
        // Check user blacklist
        if (kd.userId && db.blacklist.users[kd.userId]) {
          res.writeHead(403);
          res.end(JSON.stringify({ 
            valid: false, 
            reason: "user_banned",
            message: db.blacklist.users[kd.userId].reason || "You are banned"
          }));
          return;
        }
        
        if (isExpired(kd)) { 
          kd.revoked=true; 
          if(db.userMap[kd.userId]===nk) delete db.userMap[kd.userId]; 
          saveDB(db); 
          
          // Log expiration to webhook
          await logToWebhook(cfg, {
            title: "🟡 Key Expired",
            color: 0xFEE75C,
            fields: [
              { name: "Key", value: `\`${nk}\``, inline: true },
              { name: "User", value: kd.userId ? `<@${kd.userId}>` : "Unassigned", inline: true }
            ],
            timestamp: new Date().toISOString()
          });
          
          res.writeHead(200); 
          res.end(JSON.stringify({ 
            valid: false, 
            reason: "expired" 
          })); 
          return; 
        }
        
        if (isPaused(kd)) { 
          res.writeHead(200); 
          res.end(JSON.stringify({ 
            valid: false, 
            reason: "paused" 
          })); 
          return; 
        }
        
        // Log IP
        if (!db.ipLogs[nk]) db.ipLogs[nk] = [];
        if (!db.ipLogs[nk].includes(clientIp)) {
          db.ipLogs[nk].push(clientIp);
        }
        
        // HWID binding and change detection
        if (!kd.hwid && hwid && hwid !== "__ping__") { 
          kd.hwid = hwid; 
          if (!db.hwidChanges[nk]) db.hwidChanges[nk] = [];
          db.hwidChanges[nk].push({ hwid, timestamp: new Date().toISOString() });
          saveDB(db);
          
          // Log first HWID bind to webhook
          await logToWebhook(cfg, {
            title: "🔒 Key Activated (HWID Bound)",
            color: 0x57F287,
            fields: [
              { name: "Key", value: `\`${nk}\``, inline: true },
              { name: "Product", value: nk.startsWith("DICE") ? "🎲 Dice" : "🎁 Roblox", inline: true },
              { name: "User", value: kd.userId ? `<@${kd.userId}>` : "Unassigned", inline: true },
              { name: "HWID", value: `\`${hwid.slice(0, 16)}...\``, inline: false }
            ],
            timestamp: new Date().toISOString()
          });
        }
        else if (kd.hwid && hwid && kd.hwid !== hwid) {
          // Track HWID changes
          if (!db.hwidChanges[nk]) db.hwidChanges[nk] = [];
          db.hwidChanges[nk].push({ hwid, timestamp: new Date().toISOString() });
          
          const changeCount = db.hwidChanges[nk].length;
          const maxChanges = cfg.maxHwidChanges || 3;
          
          // Auto-revoke if too many HWID changes
          if (changeCount > maxChanges) {
            kd.revoked = true;
            saveDB(db);
            
            // Log auto-revoke to webhook
            await logToWebhook(cfg, {
              title: "🚨 Key Auto-Revoked (Sharing Detected)",
              color: 0xED4245,
              fields: [
                { name: "Key", value: `\`${nk}\``, inline: true },
                { name: "User", value: kd.userId ? `<@${kd.userId}>` : "Unassigned", inline: true },
                { name: "Reason", value: `${changeCount} HWID changes detected (limit: ${maxChanges})`, inline: false },
                { name: "IPs Used", value: db.ipLogs[nk]?.slice(0,5).map(ip => `\`${ip}\``).join(", ") || "None", inline: false }
              ],
              timestamp: new Date().toISOString()
            });
            
            res.writeHead(200); 
            res.end(JSON.stringify({ 
              valid: false, 
              reason: "auto_revoked_sharing"
            })); 
            return;
          }
          
          res.writeHead(200); 
          res.end(JSON.stringify({ 
            valid: false, 
            reason: "hwid_mismatch" 
          })); 
          return; 
        }
        
        saveDB(db);
        
        res.writeHead(200); 
        res.end(JSON.stringify({ 
          valid: true, 
          vip: kd.vip||false,
          expires_at: kd.expiresAt
        }));
      } catch (e) { 
        res.writeHead(400); 
        res.end(JSON.stringify({ 
          valid: false, 
          reason: "bad_request" 
        })); 
      }
    });
    return;
  }
  
  res.writeHead(404); 
  res.end(JSON.stringify({ 
    error: "not found" 
  }));
});

// ── Start Bot & API ───────────────────────────────────────────────────────────
server.listen(CONFIG.PORT, () => console.log(`🌐 Key API listening on port ${CONFIG.PORT}`));
client.login(CONFIG.DISCORD_TOKEN).catch(err => {
  console.error("\n❌ Failed to login. Check your DISCORD_TOKEN in the CONFIG section.\n", err);
  process.exit(1);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// END OF FILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
