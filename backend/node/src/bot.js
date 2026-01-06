import { Telegraf, Markup } from 'telegraf';
import { identifyAnimal } from './services/animalIdentifier.js';
import { downloadFile } from './utils/fileHandler.js';

// Store user's last uploaded photo and state
const userPhotos = new Map();
const userState = new Map(); // Track if we're waiting for location

// Initialize bot at module level so it's available for webhook
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Store bot username for group command filtering
let botUsername = null;

// ============================================
// Middleware to ignore commands meant for other bots in groups
// In groups, /command@other_bot should be ignored by this bot
// ============================================
bot.use(async (ctx, next) => {
  // Only process text messages with commands
  if (ctx.message?.text?.startsWith('/')) {
    const text = ctx.message.text;
    
    // Check if command is directed at a specific bot (contains @)
    if (text.includes('@')) {
      // Get bot username if we don't have it yet
      if (!botUsername) {
        try {
          const me = await ctx.telegram.getMe();
          botUsername = me.username.toLowerCase();
          console.log('Bot username:', botUsername);
        } catch (e) {
          console.error('Failed to get bot username:', e.message);
          // If we can't get username, let the command through
          return next();
        }
      }
      
      // Extract the @username from the command
      const match = text.match(/^\/\w+@(\w+)/);
      if (match && botUsername) {
        const targetBot = match[1].toLowerCase();
        // If command is for a different bot, ignore it
        if (targetBot !== botUsername) {
          console.log(`Ignoring command for @${targetBot}, I am @${botUsername}`);
          return; // Don't process this command
        }
      }
    }
  }
  
  return next();
});

// Location keyboard with common regions
const getLocationKeyboard = (autoIdentify = false) => {
  const prefix = autoIdentify ? 'loc_auto_' : 'loc_';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🇸🇬 Singapore', `${prefix}Singapore`),
      Markup.button.callback('🇲🇾 Malaysia', `${prefix}Malaysia`)
    ],
    [
      Markup.button.callback('🇮🇩 Indonesia', `${prefix}Indonesia`),
      Markup.button.callback('🇹🇭 Thailand', `${prefix}Thailand`)
    ],
    [
      Markup.button.callback('🇵🇭 Philippines', `${prefix}Philippines`),
      Markup.button.callback('🇻🇳 Vietnam', `${prefix}Vietnam`)
    ],
    [
      Markup.button.callback('🌏 Other Location', `${prefix}other`),
      Markup.button.callback('⏭️ Skip', `${prefix}skip`)
    ]
  ]);
};

// ============================================
// Register all bot handlers at module level
// This ensures they're ready before webhook setup
// ============================================

// Global error handler - catches errors like "bot was blocked by user"
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err.message);
  // Don't crash on user-blocked errors or other Telegram API errors
});

// ============================================
// Helper function to check if message is from a group
// ============================================
function isGroupChat(ctx) {
  return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

// Helper to send PM with fallback to group reply
async function sendPM(ctx, message, options = {}) {
  if (isGroupChat(ctx)) {
    try {
      await ctx.telegram.sendMessage(ctx.from.id, message, options);
      return { sent: true, isPM: true };
    } catch (error) {
      // User hasn't started the bot in PM, send message in group with note
      if (error.response?.error_code === 403) {
        await ctx.reply(
          `@${ctx.from.username || ctx.from.first_name}, I can't PM you! Please start me in private first:\n` +
          `👉 https://t.me/${botUsername}?start=frompgroup`,
          { reply_to_message_id: ctx.message?.message_id }
        );
        return { sent: false, isPM: false, error: 'blocked' };
      }
      throw error;
    }
  } else {
    // Direct chat - just reply normally
    await ctx.reply(message, options);
    return { sent: true, isPM: false };
  }
}

// /start command
bot.start((ctx) => {
  const inGroup = isGroupChat(ctx);
  
  if (inGroup) {
    ctx.reply(
      '🐾 Welcome to the WWF Animal Identification Bot!\n\n' +
      '📸 How to use (in groups):\n' +
      '1. Type /identify@wwf_animal_id_bot\n' +
      '2. Reply to my message with a photo\n' +
      '3. Enter your location (or type "skip")\n' +
      '4. Get the species information via PM!\n\n' +
      'Commands:\n' +
      '/start - Show this message\n' +
      '/help - Get help\n' +
      '/identify - Start animal identification'
    );
  } else {
    ctx.reply(
      '🐾 Welcome to the WWF Animal Identification Bot!\n\n' +
      '📸 How to use:\n' +
      '1. Type /identify to start\n' +
      '2. Upload a photo of an animal\n' +
      '3. Enter your location (or type "skip")\n' +
      '4. Get the species information!\n\n' +
      'Commands:\n' +
      '/start - Show this message\n' +
      '/help - Get help\n' +
      '/identify - Start animal identification'
    );
  }
});

// /help command
bot.help((ctx) => {
  const inGroup = isGroupChat(ctx);
  
  if (inGroup) {
    ctx.reply(
      '🔍 How to use this bot (in groups):\n\n' +
      '1. Type /identify@wwf_animal_id_bot\n' +
      '2. Reply to my message with a photo\n' +
      '3. Enter your location (or type "skip")\n' +
      '4. Get the species information via PM!\n\n' +
      '💡 Tips:\n' +
      '- Use clear, well-lit photos\n' +
      '- Make sure the animal is visible\n' +
      '- Close-up photos work best\n' +
      '- Providing location helps identify regional species'
    );
  } else {
    ctx.reply(
      '🔍 How to use this bot:\n\n' +
      '1. Type /identify to start\n' +
      '2. Upload a photo of an animal\n' +
      '3. Enter your location (or type "skip")\n' +
      '4. Get the species information!\n\n' +
      '💡 Tips:\n' +
      '- Use clear, well-lit photos\n' +
      '- Make sure the animal is visible\n' +
      '- Close-up photos work best\n' +
      '- Providing location helps identify regional species'
    );
  }
});

// Handle photo uploads - ask for location as text input
bot.on('photo', async (ctx) => {
  console.log('📷 Photo received from user:', ctx.from.id);
  
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const state = userState.get(ctx.from.id);
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.botInfo?.id;
  
  // Store photo
  userPhotos.set(ctx.from.id, photo.file_id);
  
  // Check if user initiated with /identify command OR is replying to bot's prompt
  if (state === 'waiting_for_photo' || isReplyToBot) {
    // User used /identify first, now ask for location
    userState.set(ctx.from.id, 'waiting_for_location_auto');
    userState.delete(ctx.from.id + '_prompt_msg');
    await ctx.reply('✅ Photo received!\n\n📍 Where was this photo taken? (optional)\n\nType your location or type "skip" to identify.', {
      reply_to_message_id: ctx.message.message_id
    });
  } else if (!isGroupChat(ctx)) {
    // Direct chat - photo uploaded without /identify
    await ctx.reply('✅ Photo saved!\n\nType /identify to analyze this animal.');
  }
  // In groups without /identify, silently store the photo
});

// Handle location button callbacks
bot.action(/^loc_(auto_)?(.+)$/, async (ctx) => {
  const autoIdentify = ctx.match[1] === 'auto_';
  const selection = ctx.match[2];
  const userId = ctx.from.id;
  
  // Answer callback to remove loading state
  await ctx.answerCbQuery();
  
  // Handle "other" - ask for custom location
  if (selection === 'other') {
    userState.set(userId, autoIdentify ? 'waiting_for_custom_location_auto' : 'waiting_for_custom_location');
    await ctx.editMessageText('🌍 Please type your location:');
    return;
  }
  
  // Get location (null if skipped)
  const location = selection === 'skip' ? null : selection;
  
  // Store location
  userState.set(userId + '_location', location);
  
  if (autoIdentify) {
    // Auto-identify immediately
    await performIdentification(ctx, userId, location);
  } else {
    // Update message and wait for /identify
    if (location) {
      await ctx.editMessageText(`📍 Location set to: ${location}\n\nNow type /identify to identify the animal.`);
    } else {
      await ctx.editMessageText('👍 No problem!\n\nNow type /identify to identify the animal.');
    }
  }
});

// Shared identification function
async function performIdentification(ctx, userId, location) {
  const photoFileId = userPhotos.get(userId);
  
  if (!photoFileId) {
    return ctx.reply('❌ No photo found! Please upload a photo first.');
  }
  
  const inGroup = isGroupChat(ctx);
  const processingMsg = await ctx.reply(location 
    ? `🔍 Analyzing image from ${location}... Please wait.`
    : '🔍 Analyzing image... Please wait.');
  
  try {
    const fileLink = await ctx.telegram.getFileLink(photoFileId);
    const imageBuffer = await downloadFile(fileLink.href);
    const result = await identifyAnimal(imageBuffer, location);
    
    await ctx.deleteMessage(processingMsg.message_id);
    
    if (result.success) {
      await sendIdentificationResult(ctx, result, inGroup);
    } else {
      const errorMsg = '❌ Sorry, I couldn\'t identify the animal.\n\n' +
        'Error: ' + result.error + '\n\n' +
        'Please try with a clearer photo.';
      
      if (inGroup) {
        await sendPM(ctx, errorMsg);
      } else {
        await ctx.reply(errorMsg);
      }
    }
    
    // Clear stored data
    userPhotos.delete(userId);
    userState.delete(userId);
    userState.delete(userId + '_location');
    
  } catch (error) {
    console.error('Error:', error);
    await ctx.reply('⚠️ An error occurred. Please try again.');
  }
}

// /identify command - start identification flow
bot.command('identify', async (ctx) => {
  const photoFileId = userPhotos.get(ctx.from.id);
  
  if (photoFileId) {
    // Photo already uploaded - ask for location directly
    userState.set(ctx.from.id, 'waiting_for_location_auto');
    await ctx.reply('📍 Where was this photo taken? (optional)\n\nType your location or type "skip" to identify.');
  } else {
    // No photo yet - ask user to upload (reply to this message in groups)
    userState.set(ctx.from.id, 'waiting_for_photo');
    const msg = await ctx.reply('📸 Please reply to this message with a photo of the animal you want to identify.', {
      reply_markup: { force_reply: true, selective: true }
    });
    // Store the message ID so we can check if photo is a reply to it
    userState.set(ctx.from.id + '_prompt_msg', msg.message_id);
  }
});

// Handle text messages - check if we're waiting for location
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  // Skip if it's a command
  if (text.startsWith('/')) {
    return;
  }
  
  const state = userState.get(ctx.from.id);
  
  // Handle location input (text-based)
  if (state === 'waiting_for_location' || state === 'waiting_for_location_auto' || 
      state === 'waiting_for_custom_location' || state === 'waiting_for_custom_location_auto') {
    
    const inputText = text.trim().toLowerCase();
    const location = inputText === 'skip' ? null : text.trim();
    
    // Store location
    userState.set(ctx.from.id + '_location', location);
    userState.delete(ctx.from.id);
    
    // Check if auto-identify
    const isAuto = state === 'waiting_for_location_auto' || state === 'waiting_for_custom_location_auto';
    
    if (isAuto) {
      await performIdentification(ctx, ctx.from.id, location);
    } else {
      if (location) {
        await ctx.reply(`📍 Location set to: ${location}\n\nNow type /identify to identify the animal.`);
      } else {
        await ctx.reply('👍 No problem!\n\nNow type /identify to identify the animal.');
      }
    }
  }
  // Don't respond to random text messages - only respond when in location flow
});

// Send identification result with iNaturalist image
async function sendIdentificationResult(ctx, result, sendAsPM = false) {
  const caption = `<b>${result.commonName}</b>\n<i>${result.scientificName}</i>`;
  
  if (sendAsPM) {
    // Send result via PM
    try {
      if (result.imageUrl) {
        await ctx.telegram.sendPhoto(ctx.from.id, result.imageUrl, {
          caption: caption,
          parse_mode: 'HTML'
        });
      } else {
        await ctx.telegram.sendMessage(ctx.from.id, caption, { parse_mode: 'HTML' });
      }
      // Confirm in group that result was sent
      await ctx.reply(`✅ @${ctx.from.username || ctx.from.first_name}, I've sent you the identification result in PM!`, {
        reply_to_message_id: ctx.message?.message_id
      });
    } catch (error) {
      if (error.response?.error_code === 403) {
        // User hasn't started the bot in PM
        await ctx.reply(
          `@${ctx.from.username || ctx.from.first_name}, I can't PM you! Please start me in private first:\n` +
          `👉 https://t.me/${botUsername}?start=fromgroup`,
          { reply_to_message_id: ctx.message?.message_id }
        );
      } else {
        throw error;
      }
    }
  } else {
    // Send normally in chat
    if (result.imageUrl) {
      await ctx.replyWithPhoto(result.imageUrl, {
        caption: caption,
        parse_mode: 'HTML'
      });
    } else {
      await ctx.reply(caption, { parse_mode: 'HTML' });
    }
  }
}

// ============================================
// Set up bot commands menu (the dropdown list when user types /)
// ============================================
async function setupBotCommands() {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Show welcome message (in groups: /start@wwf_animal_id_bot)' },
      { command: 'help', description: 'Show help and tips (in groups: /help@wwf_animal_id_bot)' },
      { command: 'identify', description: 'Identify wildlife (in groups: /identify@wwf_animal_id_bot)' }
    ]);
    console.log('✅ Bot commands menu set up successfully');
  } catch (error) {
    console.error('Failed to set bot commands:', error.message);
  }
}

// ============================================
// startBot - only handles launching (polling vs webhook)
// ============================================
export function startBot() {
  const WEBHOOK_URL = process.env.WEBHOOK_URL;
  
  // Set up the commands menu
  setupBotCommands();
  
  if (WEBHOOK_URL) {
    // Production (Azure): Use webhook - supports multiple users and scales well
    // Webhook is set up in app.js, just log status here
    console.log('🌐 Bot running in webhook mode (Azure/Production)');
    console.log('✅ Multiple users supported via webhook');
  } else {
    // Development: Use polling with dropPendingUpdates to avoid conflicts
    // Note: Polling still supports multiple users, just not multiple bot instances
    bot.launch({ dropPendingUpdates: true }).then(() => {
      console.log('🤖 Animal Identification Bot is running (polling mode)!');
      console.log('✅ Multiple users supported - single instance');
    }).catch((err) => {
      if (err.response?.error_code === 409) {
        console.error('❌ Bot conflict detected! Another instance is running.');
        console.error('   Stop the other instance or wait a few seconds and try again.');
        process.exit(1);
      }
      throw err;
    });
  }

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// Export bot for webhook handler
export { bot };
