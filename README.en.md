# 🤖 Telegram AI Bot — Cloudflare Workers

<p align="center">
  <a href="README.md">زبان فارسی</a> | <a href="README.en.md">English</a>
</p>

> A fast, free, serverless Telegram AI bot — runs on Cloudflare Workers with 7 AI models and automatic fallback.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=flat&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#-license)
[![Telegram Channel](https://img.shields.io/badge/Telegram-@Uciranir-26A5E4?style=flat&logo=telegram&logoColor=white)](https://t.me/Uciranir)

An all-in-one AI bot for Telegram that runs **serverless** on Cloudflare Workers — no VPS, no hosting costs, and near-zero cold start. The project automatically switches between 7 different AI models so it always responds, even if one model or service goes down.

📢 For updates and similar projects, join the channel: **[@Uciranir](https://t.me/Uciranir)**

---

## ✨ Features

| Feature | Description |
|---|---|
| 🧠 **7 AI Models** | GPT-OSS 120B, Gemma, Qwen3 30B, Llama 4 Scout, DeepSeek R1, and DeepSeek V4 Flash |
| 🔁 **Automatic Fallback** | If a model fails to respond or errors out, the next model is tried automatically |
| 🎛 **Manual Model Selection** | Users can pick their preferred model from an inline menu |
| 🖼 **Image & Video Analysis** | Vision-capable models for describing images and short videos |
| 📄 **File & Code Analysis** | Reads and analyzes text/code files (`.py` `.js` `.json`, etc.) |
| 🌐 **Online Search** | `/online` command for web-search-grounded answers via Gemini |
| 💾 **Conversation Memory** | Stores each user's chat history in Cloudflare KV |
| 📢 **Automatic Channel Promo** | Periodically shows a channel promo message every N messages (configurable) |
| ⚡️ **Serverless** | Runs entirely on Cloudflare's Edge Network — no host or VPS needed |

---

## 🧩 Model Structure

```
Automatic fallback order:
1. GPT-OSS 120B        (Cloudflare Workers AI)
2. Gemma 4 27B         (Cloudflare Workers AI — Vision)
3. Gemini 2.5 Flash    (Google AI API)
4. DeepSeek V4 Flash   (OpenModel)
5. Qwen3 30B           (Cloudflare Workers AI)
6. Llama 4 Scout       (Cloudflare Workers AI — Vision)
7. DeepSeek R1 32B     (Cloudflare Workers AI)
```

The first model that responds successfully sends the final reply to the user; the rest only activate if the previous model fails.

---

## 🚀 Setup

### 👇 Video Setup Tutorial for the Telegram AI Bot 👇

(https://t.me/UCIRANIR/33001)

### Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/) account (free plan is enough)
- A Telegram bot created via [@BotFather](https://t.me/BotFather), and its token
- (Optional) An API key from [Google AI Studio](https://aistudio.google.com/) for Gemini
- (Optional) An OpenModel API key for DeepSeek V4 Flash

### Installation Steps

**1. Create the Worker**
Paste the `worker.js` code into a new Worker in the Cloudflare dashboard, or deploy it with Wrangler.

**2. Bind a KV Namespace**
Create a KV Namespace and bind it to the Worker as `KV`. This is used to store conversation memory, the user's selected model, and message counters.

**3. Enable Workers AI**
Add the Workers AI binding named `AI` to the Worker (under Settings → Bindings).

**4. Set Environment Variables**

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | The bot token from BotFather |
| `WORKER_DOMAIN` | ✅ | Worker address, e.g. `my-bot.username.workers.dev` — must be without `https://` |
| `GEMINI_API_KEYS` | ❌ | One or more Gemini keys, comma-separated (for online search) |
| `OPENMODEL_API_KEY` | ❌ | OpenModel key for the DeepSeek V4 Flash model |

**5. Set the Webhook**
After deploying, open the following URL once in your browser:

```
https://<WORKER_DOMAIN>/setWebhook
```

If you get `"ok": true` in the response, the bot is ready to use. 🎉

---

## 💬 Bot Commands

| Command | Function |
|---|---|
| `/start` | Start and show a general guide |
| `/help` | Full command reference |
| `/clear` | Clear conversation memory |
| `/models` | List active models |
| `/engine` | Select an AI model from a menu |
| `/online [question]` | Get an answer with online search (Gemini) |

In addition, directly sending an image, video (up to the configured size limit), or text/code file is processed automatically.

---

## ⚙️ Customizable Settings

At the top of `worker.js`:

```js
const CHANNEL      = '@uciranir';      // Channel username
const CHANNEL_LINK = 'https://t.me/uciranir';
const SHOW_CH_EVERY = 15;              // Show channel promo every N messages
const MAX_HISTORY   = 6;               // Number of exchanges kept in memory
const MSG_LIMIT     = 4000;            // Max length of outgoing messages
const MAX_VIDEO_MB  = 19;              // Max video size that can be processed
```

> ⚠️ **Important note about Gemini:** keys belonging to the same Google account/project share a quota. To actually increase your quota, each key needs to come from a separate Google account.

---

## 🛡 Limitations

- Voice/audio processing (`voice` / `audio`) is not currently supported
- Max processable text file size: 500 KB
- A local rate limit is applied for Gemini to avoid quickly hitting Google's free-tier cap

---

## 📢 Support & Updates

Have a question, found a bug, or have a suggestion? Open an Issue. For new updates, similar projects, and more tutorials, follow the Telegram channel:

### 👉 [@Uciranir](https://t.me/Uciranir)

---

## 📄 License

This project is released under the MIT License. Use, modify, and distribute it freely.

⭐️ If you found this project useful, please give the repository a star!
