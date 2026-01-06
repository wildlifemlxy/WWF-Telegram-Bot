# 🐼 WWF Wildlife Telegram Bots

A collection of Telegram bots built to support WWF's mission in wildlife conservation and education.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Telegram](https://img.shields.io/badge/Telegram-Bot-blue)
![Google Gemini](https://img.shields.io/badge/Google-Gemini%20AI-orange)
![WWF](https://img.shields.io/badge/WWF-Wildlife-brightgreen)

## 🌍 About

This repository contains multiple Telegram bots created to support WWF's wildlife conservation efforts. Each bot serves a specific purpose in engaging the community and promoting wildlife awareness.

---

## 🤖 Bots

### 1. WWF Animal Identifier (`@wwf_animal_id_bot`)

Identify wildlife species from photos using AI.

**Features:**
- 📸 Identify wildlife from photos using Google Gemini AI
- 🔍 Get scientific names and common names
- 📍 Location-aware identification for regional species
- 💬 Works in Telegram groups and private chats
- 📬 Results sent via PM to keep group chats clean

**Commands:**
| Command | Description |
|---------|-------------|
| `/start` | Start the bot and see welcome message |
| `/help` | Get usage instructions and tips |
| `/identify` | Start wildlife identification |

**Usage:**
1. Type `/identify` to start
2. Upload a photo of the wildlife
3. Enter location (or type "skip")
4. Receive species information via PM!

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Telegram account
- Google AI Studio API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/WWF-Animal-Identification.git
   cd WWF-Animal-Identification
   ```

2. **Install dependencies**
   ```bash
   cd backend/node
   npm install
   ```

3. **Create a Telegram Bot**
   - Open Telegram and search for `@BotFather`
   - Send `/newbot` and follow the prompts
   - Copy the bot token

4. **Get Google Gemini API Key**
   - Go to [Google AI Studio](https://aistudio.google.com/)
   - Create an API key

5. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your credentials:
   ```env
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   GEMINI_API_KEY=your_gemini_api_key
   PORT=3001
   ```

6. **Start the bot**
   ```bash
   npm start
   ```

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Bot Framework:** Telegraf
- **AI:** Google Gemini
- **Server:** Express.js

## 📁 Project Structure

```
backend/node/
├── bin/
│   └── www              # Entry point
├── src/
│   ├── app.js           # Express app setup
│   ├── bot.js           # Telegram bot logic
│   ├── Controller/
│   │   └── Identify/
│   │       └── identifyController.js
│   ├── routes/
│   │   └── identifyRoutes.js
│   ├── services/
│   │   └── animalIdentifier.js    # Gemini AI integration
│   └── utils/
│       └── fileHandler.js
├── .env                 # Environment variables (not committed)
└── package.json
```

## 🔒 Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from BotFather |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `PORT` | Server port (default: 3001) |

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🌿 Support WWF

Learn more about WWF's wildlife conservation efforts at [wwf.org](https://www.worldwildlife.org/)

---

Made with ❤️ for wildlife conservation 🐼
