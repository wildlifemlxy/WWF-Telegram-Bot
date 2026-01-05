import { Telegraf, Markup } from 'telegraf';
import { identifyAnimal } from './services/animalIdentifier.js';
import { downloadFile } from './utils/fileHandler.js';

// Store user's last uploaded photo and state
const userPhotos = new Map();
const userState = new Map(); // Track if we're waiting for location

let bot;

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

export function startBot() {
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  // Global error handler - catches errors like "bot was blocked by user"
  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err.message);
    // Don't crash on user-blocked errors or other Telegram API errors
  });

  // /start command
  bot.start((ctx) => {
    ctx.reply(
      '🐾 Welcome to the Animal Identification Bot!\n\n' +
      '📸 How to use:\n' +
      '1. Send me a photo of an animal\n' +
      '2. Select your location (or skip)\n' +
      '3. Get the species information!\n\n' +
      'Commands:\n' +
      '/start - Show this message\n' +
      '/help - Get help\n' +
      '/identify - Identify the last uploaded animal photo'
    );
  });

  // /help command
  bot.help((ctx) => {
    ctx.reply(
      '🔍 How to use this bot:\n\n' +
      '1. Upload a photo of an animal\n' +
      '2. Select your location using the buttons\n' +
      '3. Wait for the AI to analyze\n' +
      '4. Get the species information!\n\n' +
      '💡 Tips:\n' +
      '- Use clear, well-lit photos\n' +
      '- Make sure the animal is visible\n' +
      '- Close-up photos work best\n' +
      '- Providing location helps identify regional species more accurately'
    );
  });

  // Handle photo uploads - ask for location as text input
  bot.on('photo', async (ctx) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const caption = ctx.message.caption?.trim();
    
    // Store photo
    userPhotos.set(ctx.from.id, photo.file_id);
    
    // If caption is /identify, set state to auto-identify after location
    if (caption === '/identify') {
      userState.set(ctx.from.id, 'waiting_for_location_auto');
      await ctx.reply('📍 Where was this photo taken? (optional)\n\nType your location or type "skip" to continue without location.');
    } else {
      // Set state to wait for location
      userState.set(ctx.from.id, 'waiting_for_location');
      await ctx.reply('✅ Photo received!\n\n📍 Where was this photo taken? (optional)\n\nType your location or type "skip" to continue.');
    }
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
    
    const processingMsg = await ctx.reply(location 
      ? `🔍 Analyzing image from ${location}... Please wait.`
      : '🔍 Analyzing image... Please wait.');
    
    try {
      const fileLink = await ctx.telegram.getFileLink(photoFileId);
      const imageBuffer = await downloadFile(fileLink.href);
      const result = await identifyAnimal(imageBuffer, location);
      
      await ctx.deleteMessage(processingMsg.message_id);
      
      if (result.success) {
        await sendIdentificationResult(ctx, result);
      } else {
        await ctx.reply(
          '❌ Sorry, I couldn\'t identify the animal.\n\n' +
          'Error: ' + result.error + '\n\n' +
          'Please try with a clearer photo.'
        );
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

  // /identify command - identify the stored photo with stored location
  bot.command('identify', async (ctx) => {
    const photoFileId = userPhotos.get(ctx.from.id);
    
    if (!photoFileId) {
      return ctx.reply('❌ No photo found! Please upload a photo first.');
    }
    
    // Get stored location (may be null)
    const location = userState.get(ctx.from.id + '_location') || null;
    
    await performIdentification(ctx, ctx.from.id, location);
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
    } else {
      ctx.reply('📸 Please send me a photo of an animal first.');
    }
  });

  // Send identification result with iNaturalist image
  async function sendIdentificationResult(ctx, result) {
    const caption = `<b>${result.commonName}</b>\n<i>${result.scientificName}</i>`;
    
    if (result.imageUrl) {
      // Send iNaturalist image with caption
      await ctx.replyWithPhoto(result.imageUrl, {
        caption: caption,
        parse_mode: 'HTML'
      });
    } else {
      // No image available, send text only
      await ctx.reply(caption, { parse_mode: 'HTML' });
    }
  }

  // Start bot - use webhook in production, polling in development
  const WEBHOOK_URL = process.env.WEBHOOK_URL;
  
  if (WEBHOOK_URL) {
    // Production: Use webhook
    console.log('🌐 Starting bot with webhook...');
  } else {
    // Development: Use polling
    bot.launch().then(() => {
      console.log('🤖 Animal Identification Bot is running (polling mode)!');
    });
  }

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// Export bot for webhook handler
export { bot };
