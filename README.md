# 🤖 Telegram AI Bot — Cloudflare Workers

<p align="center">
  <a href="README.md">زبان فارسی</a> | <a href="README.en.md">English</a>
</p>

> ربات هوش مصنوعی تلگرام، سریع، رایگان و بدون نیاز به سرور — اجرا روی Cloudflare Workers با ۷ مدل هوش مصنوعی و fallback خودکار.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=flat&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#-مجوز)
[![Telegram Channel](https://img.shields.io/badge/Telegram-@Uciranir-26A5E4?style=flat&logo=telegram&logoColor=white)](https://t.me/Uciranir)

یک ربات هوش مصنوعی همه‌کاره برای تلگرام که به‌صورت **Serverless** روی Cloudflare Workers اجرا می‌شود — بدون نیاز به VPS، بدون هزینه‌ی هاستینگ، و با Cold Start تقریباً صفر. این پروژه به‌صورت خودکار بین ۷ مدل هوش مصنوعی مختلف سوییچ می‌کند تا همیشه پاسخ بدهد، حتی اگر یک مدل یا سرویس از کار بیفتد.

📢 برای آپدیت‌ها و پروژه‌های مشابه، عضو کانال شوید: **[@Uciranir](https://t.me/Uciranir)**

---

## ✨ امکانات

| قابلیت | توضیح |
|---|---|
| 🧠 **۷ مدل هوش مصنوعی** | GPT-OSS 120B، Gemma، Qwen3 30B، Llama 4 Scout، DeepSeek R1 و DeepSeek V4 Flash |
| 🔁 **Fallback خودکار** | اگر یک مدل پاسخ نداد یا خطا داد، به‌صورت خودکار مدل بعدی امتحان می‌شود |
| 🎛 **انتخاب مدل دستی** | کاربر می‌تواند از منوی این‌لاین، مدل دلخواه خودش را انتخاب کند |
| 🖼 **تحلیل عکس و ویدیو** | پشتیبانی از مدل‌های Vision برای توضیح تصاویر و ویدیوهای کوتاه |
| 📄 **تحلیل فایل و کد** | خوندن و تحلیل فایل‌های متنی/کد (`.py` `.js` `.json` و...) |
| 🌐 **جستجوی آنلاین** | دستور `/online` برای پاسخ‌های مبتنی بر جستجوی وب از طریق Gemini |
| 💾 **حافظه‌ی مکالمه** | ذخیره‌ی تاریخچه‌ی هر کاربر در Cloudflare KV |
| 📢 **معرفی کانال خودکار** | نمایش دوره‌ای پیام تبلیغاتی کانال هر چند پیام یک‌بار (قابل تنظیم) |
| ⚡️ **بدون سرور** | اجرای کامل روی Edge Network کلودفلر، بدون نیاز به هاست یا VPS |

---

## 🧩 ساختار مدل‌ها

```
ترتیب fallback در حالت خودکار:
1. GPT-OSS 120B        (Cloudflare Workers AI)
2. Gemma 4 27B         (Cloudflare Workers AI — Vision)
3. Gemini 2.5 Flash    (Google AI API)
4. DeepSeek V4 Flash   (OpenModel)
5. Qwen3 30B           (Cloudflare Workers AI)
6. Llama 4 Scout       (Cloudflare Workers AI — Vision)
7. DeepSeek R1 32B     (Cloudflare Workers AI)
```

اولین مدلی که جواب بدهد، پاسخ نهایی به کاربر ارسال می‌شود؛ بقیه فقط در صورت خرابی مدل قبلی فعال می‌شوند.

---

## 🚀 راه‌اندازی

## 👇 آموزش ویدیویی راه‌اندازی ربات هوش مصنوعی تلگرام 👇
(https://t.me/UCIRANIR/33001)

### پیش‌نیازها

- یک حساب [Cloudflare](https://dash.cloudflare.com/) (پلن رایگان کافی است)
- یک بات تلگرام ساخته‌شده با [@BotFather](https://t.me/BotFather) و توکن آن
- (اختیاری) کلید API از [Google AI Studio](https://aistudio.google.com/) برای Gemini
- (اختیاری) کلید API از OpenModel برای DeepSeek V4 Flash

### مراحل نصب

**۱. ساخت Worker**
کد `worker.js` را در یک Worker جدید در داشبورد Cloudflare قرار دهید، یا با Wrangler دیپلوی کنید.

**۲. اتصال KV Namespace**
یک KV Namespace بسازید و آن را با نام متغیر `KV` به Worker بایند کنید. این برای ذخیره‌ی حافظه‌ی مکالمه، انتخاب مدل کاربر و شمارنده‌ی پیام‌ها استفاده می‌شود.

**۳. فعال‌سازی Workers AI**
باینداینگ Workers AI را با نام `AI` به Worker اضافه کنید (از بخش Settings → Bindings).

**۴. تنظیم متغیرهای محیطی**

| متغیر | اجباری | توضیح |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | توکن ربات از BotFather |
| `WORKER_DOMAIN` | ✅ | آدرس Worker، مثلاً `my-bot.username.workers.dev` |
| `GEMINI_API_KEYS` | ❌ | یک یا چند کلید Gemini با کاما جدا شده (برای جستجوی آنلاین) |
| `OPENMODEL_API_KEY` | ❌ | کلید OpenModel برای مدل DeepSeek V4 Flash |

**۵. وصل کردن وب‌هوک**
بعد از دیپلوی، آدرس زیر را یک‌بار در مرورگر باز کنید:

```
https://<WORKER_DOMAIN>/setWebhook
```

اگر پاسخ `"ok": true` دریافت کردید، ربات آماده‌ی استفاده است. 🎉

---

## 💬 دستورات ربات

| دستور | عملکرد |
|---|---|
| `/start` | شروع و نمایش راهنمای کلی |
| `/help` | راهنمای کامل دستورات |
| `/clear` | پاک کردن حافظه‌ی مکالمه |
| `/models` | نمایش لیست مدل‌های فعال |
| `/engine` | انتخاب مدل هوش مصنوعی از منو |
| `/online [سوال]` | پاسخ با جستجوی آنلاین (Gemini) |

علاوه بر این، ارسال مستقیم عکس، ویدیو (تا حداکثر حجم تعیین‌شده) یا فایل متنی/کد نیز به‌صورت خودکار پردازش می‌شود.

---

## ⚙️ تنظیمات قابل شخصی‌سازی

در ابتدای فایل `worker.js`:

```js
const CHANNEL      = '@uciranir';      // یوزرنیم کانال
const CHANNEL_LINK = 'https://t.me/uciranir';
const SHOW_CH_EVERY = 15;              // نمایش تبلیغ کانال هر چند پیام
const MAX_HISTORY   = 6;               // تعداد رفت‌وبرگشت‌های ذخیره‌شده در حافظه
const MSG_LIMIT     = 4000;            // حداکثر طول پیام ارسالی
const MAX_VIDEO_MB  = 19;              // حداکثر حجم ویدیوی قابل پردازش
```

> ⚠️ **نکته‌ی مهم درباره‌ی Gemini:** کلیدهای متعلق به یک حساب/پروژه‌ی گوگل، سهمیه‌ی (Quota) مشترک دارند. برای افزایش واقعی سهمیه، هر کلید باید از یک حساب گوگل جدا گرفته شود.

---

## 🛡 محدودیت‌ها

- پردازش صدا (`voice` / `audio`) فعلاً پشتیبانی نمی‌شود
- حداکثر حجم فایل متنی قابل پردازش: ۵۰۰ کیلوبایت
- محدودیت نرخ محلی برای Gemini جهت پیشگیری از برخورد سریع با سقف رایگان گوگل اعمال شده است

---

## 📢 پشتیبانی و آپدیت‌ها

سوال، باگ، یا پیشنهاد دارید؟ از طریق Issues مطرح کنید. برای آپدیت‌های جدید، پروژه‌های مشابه و آموزش‌های بیشتر، کانال تلگرام را دنبال کنید:

### 👉 [@Uciranir](https://t.me/Uciranir)

---

## 📄 مجوز

این پروژه تحت مجوز MIT منتشر شده است. آزادانه استفاده، تغییر و توزیع کنید.

⭐️ اگر این پروژه برایتان مفید بود، حتماً یک ستاره به ریپازیتوری بدهید!
