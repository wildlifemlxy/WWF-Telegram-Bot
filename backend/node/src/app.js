import express from 'express';
import cors from 'cors';
import identifyRoutes from './routes/identifyRoutes.js';
import { bot } from './bot.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'WWF Animal Identifier Bot is running!' });
});

// Webhook endpoint for Telegram (production)
const WEBHOOK_URL = process.env.WEBHOOK_URL;
if (WEBHOOK_URL) {
  const secretPath = `/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
  app.use(bot.webhookCallback(secretPath));
  
  // Set webhook on startup
  bot.telegram.setWebhook(`${WEBHOOK_URL}${secretPath}`).then(() => {
    console.log(`✅ Webhook set to: ${WEBHOOK_URL}${secretPath}`);
  }).catch(err => {
    console.error('Failed to set webhook:', err);
  });
}

// API Routes
app.use('/identify', identifyRoutes);

// Error handler (404 and server errors)
app.use((err, req, res, next) => {
  if (err) {
    console.error(err.stack);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
  res.status(404).json({ error: 'Not Found' });
});

export default app;
