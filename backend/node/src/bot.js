import { Telegraf } from 'telegraf';
import { identifyAnimal } from './services/animalIdentifier.js';
import { downloadFile } from './utils/fileHandler.js';

// Store user's last uploaded photo
const userPhotos = new Map();

let bot;

export function startBot() {
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  // /start command
  bot.start((ctx) => {
    ctx.reply(
      '🐾 Welcome to the Animal Identification Bot!\n\n' +
      '📸 How to use:\n' +
      '1. Send me a photo of an animal\n' +
      '2. Type /identify to identify the species\n\n' +
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
      '2. Type /identify\n' +
      '3. Wait for the AI to analyze\n' +
      '4. Get the species information!\n\n' +
      '💡 Tips:\n' +
      '- Use clear, well-lit photos\n' +
      '- Make sure the animal is visible\n' +
      '- Close-up photos work best'
    );
  });

  // Handle photo uploads - store for later identification OR identify immediately if caption is /identify
  bot.on('photo', async (ctx) => {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const caption = ctx.message.caption?.trim();
    
    // If caption is /identify, identify immediately
    if (caption === '/identify') {
      const processingMsg = await ctx.reply('🔍 Analyzing image with AI... Please wait.');
      
      try {
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const imageBuffer = await downloadFile(fileLink.href);
        const result = await identifyAnimal(imageBuffer);
        
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
      } catch (error) {
        console.error('Error:', error);
        await ctx.reply('⚠️ An error occurred. Please try again.');
      }
    } else {
      // Store photo for later identification
      userPhotos.set(ctx.from.id, photo.file_id);
      ctx.reply(
        '✅ Photo received!\n\n' +
        'Now type /identify to identify the animal species.\n' +
        '💡 Tip: You can also upload a photo with caption /identify to identify instantly!'
      );
    }
  });

  // /identify command - identify the stored photo
  bot.command('identify', async (ctx) => {
    const photoFileId = userPhotos.get(ctx.from.id);
    
    if (!photoFileId) {
      return ctx.reply('❌ No photo found! Please upload a photo first, then type /identify');
    }
    
    const processingMsg = await ctx.reply('🔍 Analyzing image with AI... Please wait.');
    
    try {
      // Get file link from Telegram
      const fileLink = await ctx.telegram.getFileLink(photoFileId);
      
      // Download the image
      const imageBuffer = await downloadFile(fileLink.href);
      
      // Identify using Google Gemini
      const result = await identifyAnimal(imageBuffer);
      
      // Delete processing message
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
      
      // Clear the stored photo after identification
      userPhotos.delete(ctx.from.id);
      
    } catch (error) {
      console.error('Error:', error);
      await ctx.reply('⚠️ An error occurred. Please try again.');
    }
  });

  // Handle non-photo messages
  bot.on('message', (ctx) => {
    if (!ctx.message.photo && !ctx.message.text?.startsWith('/')) {
      ctx.reply('📸 Please send me a photo of an animal, then type /identify');
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

  // Start bot
  bot.launch().then(() => {
    console.log('🤖 Animal Identification Bot is running!');
  });

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

export { bot };
