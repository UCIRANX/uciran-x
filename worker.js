// ============================================================
// Telegram AI Bot — Cloudflare Worker
//
// متغیرهای محیطی مورد نیاز در Cloudflare:
//   TELEGRAM_BOT_TOKEN   — توکن ربات تلگرام
//   GEMINI_API_KEYS      — یک یا چند کلید Gemini، با کاما جدا شده
//                          مثال: key1,key2,key3
//                          نکته: کلیدهای متعلق به یک حساب/پروژه گوگل
//                          سهمیه‌ی مشترک دارن. برای افزایش واقعی سهمیه
//                          باید هر کلید از یک حساب گوگل جدا گرفته شود.
//   GROQ_API_KEYS        — یک یا چند کلید Groq، با کاما جدا شده
//                          مثال: key1,key2,key3
//                          از console.groq.com بگیر (رایگان)
//   WORKER_DOMAIN        — آدرس worker مثلاً my-bot.ucir.workers.dev
//   KV                   — KV Namespace Binding (برای حافظه)
//   AI                   — Workers AI Binding
//
// ترتیب fallback (حالت خودکار):
//   ۱. GPT-OSS 120B   (@cf/openai/gpt-oss-120b)
//   ۲. Gemma 4 27B    (@cf/google/gemma-4-27b-it)
//   ۳. Gemini 2.5 Flash (Google AI API)
//   ۴. Groq Llama 4 Scout (سریع، رایگان)
//   ۵. Qwen3 30B      (@cf/qwen/qwen3-30b-a3b-fp8)
//   ۶. Llama 4 Scout  (@cf/meta/llama-4-scout-17b-16e-instruct)
//   ۷. DeepSeek R1    (@cf/deepseek-ai/deepseek-r1-distill-qwen-32b)
// ============================================================

const CHANNEL      = '@uciranir';
const CHANNEL_LINK = 'https://t.me/uciranir';
const CHANNEL_MSG  = `📢 کانال ما:\n${CHANNEL_LINK}`;
const SHOW_CH_EVERY = 15;
const MAX_HISTORY   = 6;
const MSG_LIMIT     = 4000;
const MAX_VIDEO_MB  = 19;

// ─── مدل‌های CF Workers AI ───────────────────────────────────
const CF_MODELS = [
  { id: 'gpt',      name: 'GPT-OSS 120B',    model: '@cf/openai/gpt-oss-120b',                      vision: false },
  { id: 'gemini',   name: 'Gemma 4 27B',      model: '@cf/google/gemma-4-26b-a4b-it',                    vision: true  },
  { id: 'qwen',     name: 'Qwen3 30B',        model: '@cf/qwen/qwen3-30b-a3b-fp8',                   vision: false },
  { id: 'llama',    name: 'Llama 4 Scout',    model: '@cf/meta/llama-4-scout-17b-16e-instruct',      vision: true  },
  { id: 'deepseek', name: 'DeepSeek R1 32B',  model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', vision: false },
];

// ─── ساخت/ویرایش عکس (CF Workers AI) ───────────────────────────
const IMAGE_MODELS = [
  { id: 'flux', name: 'FLUX.2 Klein',   model: '@cf/black-forest-labs/flux-2-klein-9b', kind: 'flux' },
];
const FLUX_MODEL = IMAGE_MODELS[0].model; // پیش‌فرض

// ─── Groq (سریع، رایگان) ───────────────────────────────────────
const GROQ_BASE  = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // متن + عکس (vision)
const GROQ_ID    = 'groq';
const GROQ_NAME  = 'Groq Llama 4 Scout';
const GROQ_RPM_LIMIT = 25; // پلن رایگان Groq معمولاً 30 RPM است؛ کمی پایین‌تر نگه می‌داریم

// ─── Gemini API (Google AI Studio) ────────────────────────────
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ID    = 'geminiapi';
const GEMINI_NAME  = 'Gemini 2.5 Flash';

// محدودیت نرخ محلی (برای جلوگیری از برخورد سریع به سقف رایگان گوگل)
// پلن رایگان Flash معمولاً ۱۰-۱۵ درخواست در دقیقه است؛ کمی پایین‌تر نگه می‌داریم.
const GEMINI_RPM_LIMIT   = 8;     // حداکثر درخواست در هر دقیقه، به ازای هر کلید
const GEMINI_MAX_RETRIES = 3;     // تعداد تلاش مجدد روی خطای 429/503
const GEMINI_RETRY_BASE_MS = 800; // پایه‌ی exponential backoff

// سقف حجم داده‌ی base64 رسانه (عکس/ویدیو) که به Gemini فرستاده می‌شود.
// فایل‌های حجیم (مخصوصاً ویدیو) می‌توانند به‌تنهایی هزاران توکن مصرف کنند
// و سهمیه‌ی TPM را خیلی سریع تمام کنند؛ این سقف جداگانه و پایین‌تر از
// MAX_VIDEO_MB است که فقط مخصوص مسیر Gemini API است.
const GEMINI_MAX_MEDIA_MB = 8;

// ─── ترتیب fallback کامل ─────────────────────────────────────
const FALLBACK_ORDER = [
  { type: 'cf',        cfId: 'gpt'      },
  { type: 'cf',        cfId: 'gemini'   },
  { type: 'geminiapi'                   },
  { type: 'groq'                        },
  { type: 'cf',        cfId: 'qwen'     },
  { type: 'cf',        cfId: 'llama'    },
  { type: 'cf',        cfId: 'deepseek' },
];

// ─── موتورهای قابل انتخاب ────────────────────────────────────
const ENGINES = {
  auto:      { label: '⚡️ خودکار'              },
  gpt:       { label: '🤖 GPT-OSS 120B'        },
  gemini:    { label: '🔵 Gemma 4 27B'          },
  geminiapi: { label: '✨ Gemini 2.5 Flash (آنلاین 🌐)' },
  groq:      { label: '🟢 Groq Llama 4 Scout'  },
  qwen:      { label: '🟡 Qwen3 30B'           },
  llama:     { label: '🦙 Llama 4 Scout'       },
  deepseek:  { label: '🔴 DeepSeek R1'         },
};
const DEFAULT_ENGINE = 'auto';

// ─── موتور قابل انتخاب برای ساخت/ویرایش عکس (در همان لیست /engine نشان داده می‌شود) ─
const IMAGE_ENGINES = {
  flux: { label: '🟣 FLUX.2 Klein (فقط عکس)' },
};
const DEFAULT_IMAGE_ENGINE = 'flux';

// ─── ورودی اصلی ─────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/setWebhook') return setWebhook(env);
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
      } catch (err) { console.error('fetch:', err.message); }
      return new Response('OK');
    }
    return new Response('🤖 Bot is running!', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
};

// ─── مدیریت آپدیت‌ها ────────────────────────────────────────
async function handleUpdate(update, env) {
  if (update.callback_query) return handleCallback(update.callback_query, env);

  const msg      = update.message || update.edited_message;
  if (!msg || !msg.from) return;

  const chatId   = msg.chat.id;
  const userId   = msg.from.id;
  const userName = msg.from.first_name || 'کاربر';
  const text     = msg.text || msg.caption || '';

  if (text === '/start') {
    return sendText(chatId, env,
      `سلام ${userName}! 👋\n\n` +
      `🤖 ربات هوش مصنوعی با ۷ مدل قدرتمند\n\n` +
      `📝 متن — هر سوالی داری بپرس\n` +
      `🖼 عکس — با یا بدون توضیح\n` +
      `🎬 ویدیو — حداکثر ${MAX_VIDEO_MB}MB\n` +
      `📄 فایل متنی — .txt .py .js ...\n\n` +
      `🎨 /draw [توضیح] — ساخت عکس از متن\n` +
      `✏️ /edit [توضیح] — ویرایش عکس (روی عکس ریپلای کن)\n\n` +
      `/help — راهنما\n` +
      `/clear — پاک کردن حافظه\n` +
      `/models — لیست مدل‌ها\n` +
      `/engine — انتخاب مدل\n` +
      `/online سوال — جواب با جستجوی آنلاین (Gemini)\n\n` +
      CHANNEL_MSG,
      'Markdown'
    );
  }

  if (text === '/help') {
    return sendText(chatId, env,
      `🤖 *راهنمای ربات*\n\n` +
      `متن، عکس، ویدیو یا فایل بفرست\n\n` +
      `🎨 */draw* [توضیح] — ساخت عکس از روی متن\n` +
      `مثال: \`/draw یک گربه نارنجی روی مبل آبی\`\n\n` +
      `✏️ */edit* [توضیح] — ویرایش عکس\n` +
      `روی یه عکس ریپلای کن و بنویس:\n` +
      `\`/edit پس‌زمینه رو آبی کن\`\n\n` +
      `*/clear* — پاک کردن حافظه مکالمه\n` +
      `*/models* — نمایش مدل‌های فعال\n` +
      `*/engine* — انتخاب مدل هوش مصنوعی\n` +
      `*/online* [سوال] — جستجوی وب با Gemini (بدون تغییر مدل پیش‌فرض)\n\n` +
      CHANNEL_MSG,
      'Markdown'
    );
  }

  if (text === '/clear') {
    await clearHistory(userId, env);
    return sendText(chatId, env, '✅ حافظه مکالمه پاک شد.');
  }

  if (text === '/models') {
    const current = await getUserEngine(userId, env);
    const cfList  = CF_MODELS.map(m => `• ${m.name}`).join('\n');
    return sendText(chatId, env,
      `🎛 *مدل فعلی:* ${ENGINES[current].label}\n\n` +
      `*CF Workers AI:*\n${cfList}\n\n` +
      `*Gemini API:*\n• ${GEMINI_NAME}\n\n` +
      `*Groq:*\n• ${GROQ_NAME}\n\n` +
      `*ساخت/ویرایش عکس (/draw, /edit):*\n${IMAGE_MODELS.map(m => `• ${m.name}`).join('\n')}`,
      'Markdown'
    );
  }

  if (text === '/engine') {
    const current = await getUserEngine(userId, env);
    return sendKeyboard(chatId, env,
      `🎛 *انتخاب مدل هوش مصنوعی*\n\nمدل فعلی: *${ENGINES[current].label}*\n\n` +
      `در حالت خودکار، ربات به ترتیب اولویت مدل‌ها را امتحان می‌کنه.`,
      engineKeyboard(current)
    );
  }

  if (text.startsWith('/online')) {
    const query = text.replace(/^\/online\s*/, '').trim();
    if (!query) {
      return sendText(chatId, env, '🌐 بعد از دستور بنویس چی می‌خوای سرچ کنم.\nمثال:\n`/online قیمت دلار امروز چنده؟`', 'Markdown');
    }
    await sendAction(chatId, env);
    return handleText(query, chatId, userId, userName, env, true);
  }

  if (text.startsWith('/draw')) {
    const rest = text.replace(/^\/draw\s*/, '').trim();
    const { forcedEngine, prompt } = parseImageEngineParam(rest);
    if (!prompt) {
      return sendText(chatId, env,
        '🎨 بعد از دستور توضیح بده چی بکشم.\nمثال:\n`/draw یک گربه نارنجی روی مبل آبی`\n\n' +
        'برای انتخاب صریح مدل:\n`/draw flux ...`',
        'Markdown'
      );
    }
    const engine = forcedEngine || await getUserImageEngine(userId, env);
    await sendAction(chatId, env, 'upload_photo');
    return handleDraw(prompt, chatId, engine, env);
  }

  if (text.startsWith('/edit')) {
    const rest = text.replace(/^\/edit\s*/, '').trim();
    const { forcedEngine, prompt: editPrompt } = parseImageEngineParam(rest);
    const replyPhoto = msg.reply_to_message?.photo;
    if (!replyPhoto) {
      return sendText(chatId, env, '✏️ برای ویرایش، روی یه عکس ریپلای کن و بنویس:\n`/edit پس‌زمینه رو آبی کن`', 'Markdown');
    }
    if (!editPrompt) {
      return sendText(chatId, env,
        '✏️ بعد از دستور بنویس چه تغییری بدم.\nمثال:\n`/edit پس‌زمینه رو آبی کن`\n\n' +
        'برای انتخاب صریح مدل:\n`/edit flux ...`',
        'Markdown'
      );
    }
    const engine = forcedEngine || await getUserImageEngine(userId, env);
    await sendAction(chatId, env, 'upload_photo');
    return handleEdit(replyPhoto, editPrompt, chatId, engine, env);
  }

  if (msg.video || msg.video_note) {
    await sendAction(chatId, env);
    return handleVideo(msg, chatId, userId, userName, env);
  }
  if (msg.photo) {
    await sendAction(chatId, env);
    return handlePhoto(msg, chatId, userId, userName, env);
  }
  if (msg.document) {
    await sendAction(chatId, env);
    return handleDocument(msg, chatId, userId, userName, env);
  }
  if (msg.voice || msg.audio) {
    return sendText(chatId, env, '🎙 پردازش صدا فعلاً پشتیبانی نمیشه.');
  }
  if (text) {
    await sendAction(chatId, env);
    return handleText(text, chatId, userId, userName, env);
  }
}

// ─── پردازش متن ──────────────────────────────────────────────
async function handleText(userMessage, chatId, userId, userName, env, forceSearch = false) {
  try {
    const engine = await getUserEngine(userId, env);
    const willSearch = forceSearch || engine === GEMINI_ID;

    const history = await loadHistory(userId, env);
    const sysPrompt = willSearch ? buildOnlineSysPrompt(userName) : buildSysPrompt(userName);
    const messages = [
      { role: 'system', content: sysPrompt },
      ...history,
      { role: 'user', content: userMessage }
    ];

    const { reply, modelName } = await callAI(messages, null, engine, false, env, forceSearch);

    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: reply });
    await saveHistory(userId, history, env);

    const suffix = await channelSuffix(userId, env);
    await sendText(chatId, env, buildPrefix(modelName) + reply + suffix);
  } catch (err) {
    console.error('handleText:', err.message);
    await sendText(chatId, env, '🚫 ' + err.message);
  }
}

// ─── پردازش عکس ──────────────────────────────────────────────
async function handlePhoto(msg, chatId, userId, userName, env) {
  try {
    const fileId  = msg.photo[Math.min(msg.photo.length - 1, 2)].file_id;
    const caption = msg.caption || 'این عکس رو به فارسی توضیح بده.';

    const fileUrl = await getTelegramFileUrl(fileId, env);
    if (!fileUrl) return sendText(chatId, env, '❌ دریافت عکس ناموفق بود.');

    const imgBuf = await (await fetch(fileUrl)).arrayBuffer();
    const base64 = arrayBufferToBase64(imgBuf);
    const mime   = getMimeFromUrl(fileUrl);

    const imageContent = [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
      { type: 'text', text: caption }
    ];

    const engine = await getUserEngine(userId, env);
    const { reply, modelName } = await callAI(null, imageContent, engine, true, env);

    const history = await loadHistory(userId, env);
    history.push({ role: 'user', content: `[عکس] ${caption}` });
    history.push({ role: 'assistant', content: reply });
    await saveHistory(userId, history, env);

    const suffix = await channelSuffix(userId, env);
    await sendText(chatId, env, `🖼 ${buildPrefix(modelName)}${reply}${suffix}`);
  } catch (err) {
    console.error('handlePhoto:', err.message);
    await sendText(chatId, env, '🚫 خطا در پردازش عکس: ' + err.message);
  }
}

// تجزیه ورودی /draw یا /edit برای پیدا کردن مدل صریح (flux/gpt) در ابتدای متن
function parseImageEngineParam(rest) {
  const match = rest.match(/^(flux)\s+(.+)$/i);
  if (match) {
    return { forcedEngine: match[1].toLowerCase(), prompt: match[2].trim() };
  }
  return { forcedEngine: null, prompt: rest };
}

// پیدا کردن الگوی سایز داخل متن (مثلاً 1024x720 یا 1024*720) و حذفش از پرامپت
const SIZE_PATTERN = /(\d{2,5})\s*[x×*]\s*(\d{2,5})/i;
function extractSizeFromPrompt(prompt) {
  const match = prompt.match(SIZE_PATTERN);
  if (!match) return { prompt, width: null, height: null };
  const width  = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  const cleaned = prompt.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  return { prompt: cleaned || prompt, width, height };
}

// محاسبه سایز خروجی با حفظ نسبت تصویر، طوری که بزرگترین ضلع همیشه زیر ۵۱۲ باشه
// (برای کاهش مصرف Neuron مدل FLUX روی پلن رایگان کلودفلر)
const MAX_IMAGE_SIDE = 800; // مضرب ۸
function scaleDimensions(width, height) {
  if (!width || !height) return { width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE };
  const ratio = width / height;
  let outW, outH;
  if (width >= height) {
    outW = MAX_IMAGE_SIDE;
    outH = Math.round(MAX_IMAGE_SIDE / ratio);
  } else {
    outH = MAX_IMAGE_SIDE;
    outW = Math.round(MAX_IMAGE_SIDE * ratio);
  }
  // گرد کردن به نزدیک‌ترین مضرب ۸ (نیاز اکثر مدل‌های تصویری)
  outW = Math.max(64, Math.round(outW / 8) * 8);
  outH = Math.max(64, Math.round(outH / 8) * 8);
  return { width: outW, height: outH };
}

// لیست مدل‌ها بر اساس موتور انتخابی (auto = همه به ترتیب، غیر آن = فقط همان یکی)
function resolveImageChain(engine) {
  if (engine && engine !== 'auto') {
    const found = IMAGE_MODELS.find(m => m.id === engine);
    return found ? [found] : IMAGE_MODELS;
  }
  return IMAGE_MODELS;
}

// اجرای واقعی مدل تصویری بسته به نوع آن (هر مدل API متفاوتی داره)
//   flux: ورودی multipart/form-data، عکس مرجع با input_image_0..3 (باینری)
//   gpt:  ورودی JSON ساده، عکس مرجع داخل آرایه images (base64 / data URI)
async function runImageModel(m, prompt, srcBuf, env, size) {
  const { width, height } = size || MAX_IMAGE_SIDE_DEFAULT();

  if (m.kind === 'flux') {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', String(width));
    form.append('height', String(height));
    if (srcBuf) form.append('input_image_0', new Blob([srcBuf]), 'image.png');

    const formResponse = new Response(form);
    const formStream    = formResponse.body;
    const formContentType = formResponse.headers.get('content-type');

    return env.AI.run(m.model, { multipart: { body: formStream, contentType: formContentType } });
  }

  // kind === 'gpt' (openai/gpt-image-1.5)
  const input = { prompt };
  if (srcBuf) input.images = [`data:image/png;base64,${arrayBufferToBase64(srcBuf)}`];
  return env.AI.run(m.model, input);
}

function MAX_IMAGE_SIDE_DEFAULT() {
  return { width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE };
}

// ─── ساخت عکس از متن (انتخاب دستی یا خودکار از بین مدل‌های فعال) ─
async function handleDraw(rawPrompt, chatId, engine, env) {
  if (!env.AI) return sendText(chatId, env, '🚫 AI binding تنظیم نشده.');

  // اگه کاربر توی متن سایزی نوشته بود (مثلاً 1024x720)، استخراجش کن، از پرامپت حذفش کن
  // و با حفظ همون نسبت، به سایزی زیر ۵۱۲ پیکسل تبدیلش کن
  const { prompt, width, height } = extractSizeFromPrompt(rawPrompt);
  const size = scaleDimensions(width, height);

  const chain = resolveImageChain(engine);
  let lastErr = null;
  for (const m of chain) {
    try {
      const resp = await runImageModel(m, prompt, null, env, size);
      const imgBuffer = await imageResponseToBuffer(resp, env);
      if (!imgBuffer) throw new Error(`${m.name} تصویری برنگردوند.`);

      await sendPhotoBuffer(chatId, env, imgBuffer, `🎨 [${m.name}] ${prompt}`);
      return;
    } catch (err) {
      console.warn(`[draw] ${m.name} failed: ${err.message}`);
      lastErr = err;
    }
  }
  await sendText(chatId, env, '🚫 خطا در ساخت عکس: ' + (lastErr?.message || 'همه مدل‌ها ناموفق بودن.'));
}

// ─── ویرایش عکس موجود (انتخاب دستی یا خودکار از بین مدل‌های فعال) ─
async function handleEdit(photoArr, editPrompt, chatId, engine, env) {
  if (!env.AI) return sendText(chatId, env, '🚫 AI binding تنظیم نشده.');

  try {
    const photoIdx = Math.min(photoArr.length - 1, 2);
    const photoObj = photoArr[photoIdx];
    const fileUrl  = await getTelegramFileUrl(photoObj.file_id, env);
    if (!fileUrl) return sendText(chatId, env, '❌ دریافت عکس ناموفق بود.');

    const srcBuf = await (await fetch(fileUrl)).arrayBuffer();

    // نسبت ابعاد عکس اصلی (که تلگرام خودش برمی‌گردونه) رو حفظ کن و زیر ۵۱۲ پیکسل بیارش
    const size = scaleDimensions(photoObj.width, photoObj.height);

    const chain = resolveImageChain(engine);
    let lastErr = null;
    for (const m of chain) {
      try {
        const resp = await runImageModel(m, editPrompt, srcBuf, env, size);
        const imgBuffer = await imageResponseToBuffer(resp, env);
        if (!imgBuffer) throw new Error(`${m.name} تصویری برنگردوند.`);

        await sendPhotoBuffer(chatId, env, imgBuffer, `✏️ [${m.name}] ${editPrompt}`);
        return;
      } catch (err) {
        console.warn(`[edit] ${m.name} failed: ${err.message}`);
        lastErr = err;
      }
    }
    await sendText(chatId, env, '🚫 خطا در ویرایش عکس: ' + (lastErr?.message || 'همه مدل‌ها ناموفق بودن.'));
  } catch (err) {
    console.error('handleEdit:', err.message);
    await sendText(chatId, env, '🚫 خطا در ویرایش عکس: ' + err.message);
  }
}

// تبدیل پاسخ مدل تصویری (FLUX یا GPT-Image) به ArrayBuffer
// FLUX معمولاً base64 خام برمی‌گردونه؛ gpt-image-1.5 گاهی base64 و گاهی لینک URL برمی‌گردونه
async function imageResponseToBuffer(resp, env) {
  if (!resp) return null;
  if (resp instanceof ArrayBuffer) return resp;
  if (resp instanceof Uint8Array) return resp.buffer;

  const img = resp.image || resp.result?.image || resp.data?.[0]?.b64_json || resp.b64_json || null;
  if (!img) return null;

  // اگر لینک URL بود (مثلاً خروجی gpt-image-1.5)، دانلودش کن
  if (typeof img === 'string' && /^https?:\/\//i.test(img)) {
    const r = await fetch(img);
    return await r.arrayBuffer();
  }

  // در غیر این صورت base64 فرض می‌کنیم (با یا بدون پیشوند data URI)
  const b64 = typeof img === 'string' && img.startsWith('data:')
    ? img.split(',')[1]
    : img;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ─── پردازش ویدیو ────────────────────────────────────────────
async function handleVideo(msg, chatId, userId, userName, env) {
  try {
    const videoObj = msg.video || msg.video_note;
    const caption  = msg.caption || 'این ویدیو رو به فارسی توضیح بده.';

    if ((videoObj.file_size || 0) > MAX_VIDEO_MB * 1024 * 1024) {
      return sendText(chatId, env, `❌ ویدیو خیلی بزرگه. حداکثر ${MAX_VIDEO_MB}MB`);
    }

    await sendText(chatId, env, '⏳ در حال دانلود و تحلیل ویدیو...');

    const fileUrl = await getTelegramFileUrl(videoObj.file_id, env);
    if (!fileUrl) return sendText(chatId, env, '❌ دریافت ویدیو ناموفق بود.');

    const vidBuf = await (await fetch(fileUrl)).arrayBuffer();
    const base64 = arrayBufferToBase64(vidBuf);

    const imageContent = [
      { type: 'image_url', image_url: { url: `data:video/mp4;base64,${base64}` } },
      { type: 'text', text: caption }
    ];

    const engine = await getUserEngine(userId, env);
    const { reply, modelName } = await callAI(null, imageContent, engine, true, env);

    const history = await loadHistory(userId, env);
    history.push({ role: 'user', content: `[ویدیو] ${caption}` });
    history.push({ role: 'assistant', content: reply });
    await saveHistory(userId, history, env);

    await sendText(chatId, env, `🎬 ${buildPrefix(modelName)}${reply}`);
  } catch (err) {
    console.error('handleVideo:', err.message);
    await sendText(chatId, env, '🚫 خطا در پردازش ویدیو: ' + err.message);
  }
}

// ─── پردازش فایل ─────────────────────────────────────────────
async function handleDocument(msg, chatId, userId, userName, env) {
  const doc      = msg.document;
  const fileName = doc.file_name || 'file';
  const mimeType = doc.mime_type || '';
  const caption  = msg.caption || '';

  const allowedExts = ['.txt','.md','.py','.js','.ts','.json','.xml','.html',
    '.css','.csv','.yaml','.yml','.sh','.c','.cpp','.java','.php','.rb',
    '.go','.rs','.sql','.env','.ini','.toml','.log'];
  const ext    = '.' + fileName.split('.').pop().toLowerCase();
  const isText = mimeType.startsWith('text/') || mimeType.includes('json') ||
                 mimeType.includes('xml') || allowedExts.includes(ext);

  if (!isText) return sendText(chatId, env, '❌ فرمت فایل پشتیبانی نمیشه.');
  if (doc.file_size && doc.file_size > 500 * 1024) return sendText(chatId, env, '❌ فایل خیلی بزرگه. حداکثر 500KB.');

  try {
    const fileUrl = await getTelegramFileUrl(doc.file_id, env);
    if (!fileUrl) return sendText(chatId, env, '❌ دریافت فایل ناموفق بود.');

    const fileText  = await (await fetch(fileUrl)).text();
    const truncated = fileText.length > 8000
      ? fileText.slice(0, 8000) + '\n\n[... ادامه برش خورد ...]' : fileText;

    const prompt = caption
      ? `فایل "${fileName}":\n\`\`\`\n${truncated}\n\`\`\`\n\n${caption}`
      : `فایل "${fileName}" رو تحلیل کن:\n\`\`\`\n${truncated}\n\`\`\``;

    const history   = await loadHistory(userId, env);
    const sysPrompt = `You are a helpful AI assistant. Analyze files and code carefully. ALWAYS respond in Persian (Farsi) by default — this is the top priority. Only switch to another language if the user clearly writes in that language. User's name: ${userName}.`;
    const messages  = [
      { role: 'system', content: sysPrompt },
      ...history,
      { role: 'user', content: prompt }
    ];

    const engine = await getUserEngine(userId, env);
    const { reply, modelName } = await callAI(messages, null, engine, false, env);

    history.push({ role: 'user', content: `[فایل: ${fileName}] ${caption}` });
    history.push({ role: 'assistant', content: reply });
    await saveHistory(userId, history, env);

    const suffix = await channelSuffix(userId, env);
    await sendText(chatId, env, `📄 ${buildPrefix(modelName)}${reply}${suffix}`);
  } catch (err) {
    console.error('handleDocument:', err.message);
    await sendText(chatId, env, '🚫 خطا در پردازش فایل: ' + err.message);
  }
}

// ─── هسته AI ─────────────────────────────────────────────────
async function callAI(messages, imageContent, engine, isMedia, env, forceSearch = false) {
  // حالت /online — صرف‌نظر از موتور انتخابی، مستقیم میره روی Gemini با سرچ
  if (forceSearch) {
    if (!getGeminiKeys(env).length) throw new Error('GEMINI_API_KEYS تنظیم نشده.');
    return callGemini(messages, imageContent, env, true);
  }

  // حالت دستی
  if (engine !== 'auto') {
    if (engine === GROQ_ID) {
      if (!getGroqKeys(env).length) throw new Error('GROQ_API_KEYS تنظیم نشده.');
      return callGroq(messages, imageContent, env);
    }
    if (engine === GEMINI_ID) {
      if (!getGeminiKeys(env).length) throw new Error('GEMINI_API_KEYS تنظیم نشده.');
      // انتخاب دستی Gemini API = همیشه با حالت آنلاین (سرچ)
      return callGemini(messages, imageContent, env, true);
    }
    const cfModel = CF_MODELS.find(m => m.id === engine);
    if (!cfModel) throw new Error('مدل نامعتبر.');
    if (isMedia && !cfModel.vision) throw new Error(`${cfModel.name} از تصویر پشتیبانی نمی‌کنه.`);
    return callCF(cfModel, messages, imageContent, env);
  }

  // حالت خودکار
  const errors = [];
  for (const step of FALLBACK_ORDER) {
    try {
      if (step.type === 'geminiapi') {
        if (!getGeminiKeys(env).length) continue;
        return await callGemini(messages, imageContent, env, false);
      }
      if (step.type === 'groq') {
        if (!getGroqKeys(env).length) continue;
        return await callGroq(messages, imageContent, env);
      }
      const cfModel = CF_MODELS.find(m => m.id === step.cfId);
      if (!cfModel || (isMedia && !cfModel.vision)) continue;
      return await callCF(cfModel, messages, imageContent, env);
    } catch (err) {
      const label = step.type === 'geminiapi' ? GEMINI_NAME
        : step.type === 'groq' ? GROQ_NAME
        : CF_MODELS.find(m => m.id === step.cfId)?.name;
      console.warn(`[fallback] ${label}: ${err.message}`);
      errors.push(`${label}: ${err.message}`);
    }
  }
  throw new Error('همه مدل‌ها ناموفق بودن.');
}

// ─── CF Workers AI ───────────────────────────────────────────
async function callCF(cfModel, messages, imageContent, env) {
  if (!env.AI) throw new Error('AI binding تنظیم نشده.');

  const input = imageContent
    ? { messages: [
        { role: 'system', content: VISION_SYS_PROMPT },
        { role: 'user', content: imageContent }
      ], max_tokens: 2048 }
    : { messages, max_tokens: 2048 };

  const resp = await env.AI.run(cfModel.model, input);
  const text = resp?.response || resp?.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error(`${cfModel.name} پاسخ خالی داد.`);

  console.log(`✅ CF: ${cfModel.name}`);
  return { reply: text.trim(), modelName: cfModel.name };
}

// ─── Groq (سریع، رایگان، OpenAI-compatible، چندکلیدی) ─────────

// لیست کلیدها را از GROQ_API_KEYS (با کاما جدا شده) می‌خوانیم.
function getGroqKeys(env) {
  const raw = env.GROQ_API_KEYS || env.GROQ_API_KEY || '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

// چرخش round-robin بین کلیدها با استفاده از KV (در صورت نبود KV، همیشه کلید اول)
async function nextGroqKeyIndex(env, keyCount) {
  if (!env.KV || keyCount <= 1) return 0;
  try {
    const raw = await env.KV.get('groq:key_idx');
    const idx = ((raw ? parseInt(raw) : 0) + 1) % keyCount;
    await env.KV.put('groq:key_idx', String(idx), { expirationTtl: 60 * 60 * 24 });
    return idx;
  } catch { return 0; }
}

// چک می‌کند که آیا این کلید در پنجره‌ی فعلی به سقف رسیده — بدون افزایش شمارنده
async function isGroqKeyThrottled(env, keyIndex) {
  if (!env.KV) return false;
  try {
    const bucket = Math.floor(Date.now() / 60000);
    const raw = await env.KV.get(`groq:rpm:${keyIndex}:${bucket}`);
    const count = raw ? parseInt(raw) : 0;
    return count >= GROQ_RPM_LIMIT;
  } catch { return false; }
}

// فقط زمانی صدا زده می‌شود که یک درخواست واقعی به این کلید فرستاده شده
async function recordGroqKeyUsage(env, keyIndex) {
  if (!env.KV) return;
  try {
    const bucket = Math.floor(Date.now() / 60000);
    const key = `groq:rpm:${keyIndex}:${bucket}`;
    const raw = await env.KV.get(key);
    const count = raw ? parseInt(raw) : 0;
    await env.KV.put(key, String(count + 1), { expirationTtl: 90 });
  } catch { /* بی‌اهمیت در صورت خطا */ }
}

async function callGroq(messages, imageContent, env) {
  const keys = getGroqKeys(env);
  if (!keys.length) throw new Error('GROQ_API_KEYS تنظیم نشده.');

  // Groq هم مثل CF از فرمت OpenAI messages استفاده می‌کنه
  const groqMessages = imageContent
    ? [
        { role: 'system', content: VISION_SYS_PROMPT },
        { role: 'user', content: imageContent }
      ]
    : messages;

  let lastErr = null;
  let keyIndex = await nextGroqKeyIndex(env, keys.length);
  const maxAttempts = Math.max(3, keys.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // اگه این کلید توی پنجره‌ی فعلی به سقف محلی رسیده، بدون هزینه‌ی یک round-trip رد شو
    const throttled = await isGroqKeyThrottled(env, keyIndex);
    if (throttled) {
      if (keys.length > 1) {
        keyIndex = (keyIndex + 1) % keys.length;
        continue;
      }
      lastErr = new Error('Groq: به سقف نرخ محلی رسیدیم.');
      break;
    }

    const apiKey = keys[keyIndex];
    await recordGroqKeyUsage(env, keyIndex);

    try {
      const res = await fetch(GROQ_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model: GROQ_MODEL, messages: groqMessages, max_tokens: 2048 })
      });

      const bodyText = await res.text();

      if (res.status === 429 || res.status === 503) {
        lastErr = new Error(`Groq ${res.status}: ${bodyText.slice(0, 150)}`);
        console.warn(`[groq] key#${keyIndex} ${res.status}, retry...`);
        if (keys.length > 1) {
          keyIndex = (keyIndex + 1) % keys.length;
          continue;
        }
        break;
      }

      if (!res.ok) throw new Error(`Groq ${res.status}: ${bodyText.slice(0, 150)}`);

      let data;
      try { data = JSON.parse(bodyText); } catch { throw new Error('Groq parse error'); }

      const text = data?.choices?.[0]?.message?.content || '';
      if (!text.trim()) throw new Error('Groq پاسخ خالی داد.');

      console.log(`✅ Groq: ${GROQ_MODEL} (key#${keyIndex})`);
      return { reply: text.trim(), modelName: GROQ_NAME };

    } catch (err) {
      lastErr = err;
      if (keys.length > 1) keyIndex = (keyIndex + 1) % keys.length;
      else break;
    }
  }

  throw lastErr || new Error('Groq ناموفق بود.');
}

// ─── Gemini API (Google AI Studio) ────────────────────────────

// لیست کلیدها را از GEMINI_API_KEYS (با کاما جدا شده) می‌خوانیم.
function getGeminiKeys(env) {
  const raw = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

// چرخش round-robin بین کلیدها با استفاده از KV (در صورت نبود KV، همیشه کلید اول)
async function nextGeminiKeyIndex(env, keyCount) {
  if (!env.KV || keyCount <= 1) return 0;
  try {
    const raw = await env.KV.get('gemini:key_idx');
    const idx = ((raw ? parseInt(raw) : 0) + 1) % keyCount;
    await env.KV.put('gemini:key_idx', String(idx), { expirationTtl: 60 * 60 * 24 });
    return idx;
  } catch { return 0; }
}

// چک می‌کند که آیا این کلید در پنجره‌ی فعلی به سقف رسیده — بدون افزایش شمارنده
async function isGeminiKeyThrottled(env, keyIndex) {
  if (!env.KV) return false;
  try {
    const bucket = Math.floor(Date.now() / 60000);
    const raw = await env.KV.get(`gemini:rpm:${keyIndex}:${bucket}`);
    const count = raw ? parseInt(raw) : 0;
    return count >= GEMINI_RPM_LIMIT;
  } catch { return false; }
}

// فقط زمانی صدا زده می‌شود که یک درخواست واقعی به این کلید فرستاده شده
async function recordGeminiKeyUsage(env, keyIndex) {
  if (!env.KV) return;
  try {
    const bucket = Math.floor(Date.now() / 60000);
    const key = `gemini:rpm:${keyIndex}:${bucket}`;
    const raw = await env.KV.get(key);
    const count = raw ? parseInt(raw) : 0;
    await env.KV.put(key, String(count + 1), { expirationTtl: 90 });
  } catch { /* بی‌اهمیت در صورت خطا */ }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildGeminiPayload(messages, imageContent, useSearch) {
  let payload;
  if (imageContent) {
    // imageContent: [{ type: 'image_url', image_url: { url: 'data:MIME;base64,...' } }, { type: 'text', text }]
    const parts = [];
    for (const block of imageContent) {
      if (block.type === 'image_url') {
        const dataUrl = block.image_url.url;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
      } else if (block.type === 'text') {
        parts.push({ text: block.text });
      }
    }
    payload = { contents: [{ role: 'user', parts }] };
    payload.systemInstruction = { parts: [{ text: VISION_SYS_PROMPT }] };
  } else {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs  = messages.filter(m => m.role !== 'system');
    payload = {
      contents: chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
      }))
    };
    if (systemMsg) payload.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }
  if (useSearch) payload.tools = [{ google_search: {} }];
  return payload;
}

async function callGemini(messages, imageContent, env, useSearch = false) {
  const keys = getGeminiKeys(env);
  if (!keys.length) throw new Error('GEMINI_API_KEYS تنظیم نشده.');

  if (imageContent) {
    const imgBlock = imageContent.find(b => b.type === 'image_url');
    const base64Data = imgBlock?.image_url?.url?.split(',')[1] || '';
    const approxMb = (base64Data.length * 0.75) / (1024 * 1024); // تخمین حجم واقعی از روی base64
    if (approxMb > GEMINI_MAX_MEDIA_MB) {
      throw new Error(`فایل برای Gemini API خیلی بزرگه (~${approxMb.toFixed(1)}MB، حداکثر ${GEMINI_MAX_MEDIA_MB}MB).`);
    }
  }

  const payload = buildGeminiPayload(messages, imageContent, useSearch);
  let lastErr = null;
  let keyIndex = await nextGeminiKeyIndex(env, keys.length);
  const maxAttempts = Math.max(GEMINI_MAX_RETRIES, keys.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // اگه این کلید توی پنجره‌ی فعلی به سقف محلی رسیده، بدون هزینه‌ی یک round-trip رد شو
    const throttled = await isGeminiKeyThrottled(env, keyIndex);
    if (throttled) {
      if (keys.length > 1) {
        keyIndex = (keyIndex + 1) % keys.length;
        continue;
      }
      // تک‌کلیدی: به‌جای زدن درخواست بی‌فایده، با backoff صبر کن
      lastErr = new Error('Gemini: به سقف نرخ محلی رسیدیم، در حال انتظار...');
      await sleep(GEMINI_RETRY_BASE_MS * Math.pow(2, attempt));
      continue;
    }

    const apiKey = keys[keyIndex];
    const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    // فقط همین‌جا، درست قبل از فرستادن درخواست واقعی، مصرف را ثبت کن
    await recordGeminiKeyUsage(env, keyIndex);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const bodyText = await res.text();

      if (res.status === 429 || res.status === 503) {
        lastErr = new Error(`Gemini ${res.status}: ${bodyText.slice(0, 150)}`);
        console.warn(`[gemini] key#${keyIndex} ${res.status}, retry...`);
        if (keys.length > 1) {
          keyIndex = (keyIndex + 1) % keys.length;
        } else {
          await sleep(GEMINI_RETRY_BASE_MS * Math.pow(2, attempt));
        }
        continue;
      }

      if (!res.ok) throw new Error(`Gemini ${res.status}: ${bodyText.slice(0, 150)}`);

      let data;
      try { data = JSON.parse(bodyText); } catch { throw new Error('Gemini parse error'); }

      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map(p => p.text || '').join('').trim();
      if (!text) throw new Error('Gemini پاسخ خالی داد.');

      const usedSearch = useSearch && !!(data?.candidates?.[0]?.groundingMetadata);
      const label = usedSearch ? `${GEMINI_NAME} 🌐` : GEMINI_NAME;

      console.log(`✅ Gemini: ${GEMINI_MODEL} (key#${keyIndex})${useSearch ? ' search' : ''}`);
      return { reply: text, modelName: label };

    } catch (err) {
      lastErr = err;
      // خطای غیر از 429/503 (مثل پارس یا شبکه) را هم با کلید بعدی امتحان کن
      if (keys.length > 1) keyIndex = (keyIndex + 1) % keys.length;
      else break;
    }
  }

  throw lastErr || new Error('Gemini ناموفق بود.');
}

// ─── ابزارهای کمکی ───────────────────────────────────────────

function buildSysPrompt(userName) {
  return `You are a helpful AI assistant in a Telegram bot. ALWAYS respond in Persian (Farsi) by default — this is the top priority. Only switch to another language if the user clearly writes in that language. Be clear and concise. User's name: ${userName}. Current date/time: ${new Date().toUTCString()}.`;
}

// پیام سیستمی برای پردازش عکس/ویدیو — چون این مسیر پیام system جدا نمی‌گیرد،
// این متن ثابت و مستقیم استفاده می‌شود تا اولویت فارسی همیشه رعایت شود،
// حتی وقتی کاربر خودش caption دلخواه (به فارسی یا غیر آن) فرستاده باشد.
const VISION_SYS_PROMPT = 'You are a helpful AI assistant analyzing an image or video in a Telegram bot. ALWAYS respond in Persian (Farsi) by default — this is the top priority. Only switch to another language if the user\'s caption is clearly written in that language. Be clear and concise.';

function buildOnlineSysPrompt(userName) {
  return `You are a helpful AI assistant in a Telegram bot. You HAVE live access to the Google Search tool in this request — it is enabled and available to you right now. For ANY question about current events, news, prices, dates, scores, or anything that could be time-sensitive or recent, you MUST actively use the Google Search tool before answering — do not rely on your training data, and do not claim you lack internet access; you currently have it. Never say you cannot access real-time information; instead, search and answer based on the results. ALWAYS respond in Persian (Farsi) by default unless the user clearly writes in another language. Be clear and concise. User's name: ${userName}. Current date/time: ${new Date().toUTCString()}.`;
}

function buildPrefix(modelName) {
  return `[${modelName}]\n\n`;
}

async function getUserEngine(userId, env) {
  if (!env.KV) return DEFAULT_ENGINE;
  try {
    const v = await env.KV.get(`engine:${userId}`);
    return (v && ENGINES[v]) ? v : DEFAULT_ENGINE;
  } catch { return DEFAULT_ENGINE; }
}

async function setUserEngine(userId, engine, env) {
  if (!env.KV) return;
  try { await env.KV.put(`engine:${userId}`, engine, { expirationTtl: 60 * 60 * 24 * 90 }); }
  catch (err) { console.warn('setUserEngine:', err.message); }
}

async function getUserImageEngine(userId, env) {
  if (!env.KV) return DEFAULT_IMAGE_ENGINE;
  try {
    const v = await env.KV.get(`imgengine:${userId}`);
    return (v && IMAGE_ENGINES[v]) ? v : DEFAULT_IMAGE_ENGINE;
  } catch { return DEFAULT_IMAGE_ENGINE; }
}

async function setUserImageEngine(userId, engine, env) {
  if (!env.KV) return;
  try { await env.KV.put(`imgengine:${userId}`, engine, { expirationTtl: 60 * 60 * 24 * 90 }); }
  catch (err) { console.warn('setUserImageEngine:', err.message); }
}

function engineKeyboard(current) {
  return {
    inline_keyboard: Object.entries(ENGINES).map(([id, info]) => [{
      text: (id === current ? '✅ ' : '') + info.label,
      callback_data: `engine:${id}`
    }])
  };
}

async function handleCallback(cq, env) {
  const data   = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const userId = cq.from?.id;
  if (!chatId || !userId) return answerCallback(cq.id, env, '');

  if (!data.startsWith('engine:')) return answerCallback(cq.id, env, '');

  const engine = data.replace('engine:', '');
  if (!ENGINES[engine]) return answerCallback(cq.id, env, '❌ گزینه نامعتبر');

  await setUserEngine(userId, engine, env);
  await answerCallback(cq.id, env, `✅ تغییر کرد به: ${ENGINES[engine].label}`);

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `🎛 *انتخاب مدل هوش مصنوعی*\n\nمدل فعلی: *${ENGINES[engine].label}*\n\nدر حالت خودکار، ربات به ترتیب اولویت مدل‌ها را امتحان می‌کنه.`,
        parse_mode: 'Markdown',
        reply_markup: engineKeyboard(engine)
      })
    });
  } catch (err) { console.warn('editMessage:', err.message); }
}

// ─── حافظه ───────────────────────────────────────────────────

async function loadHistory(userId, env) {
  if (!env.KV) return [];
  try {
    const raw = await env.KV.get(`hist:${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveHistory(userId, history, env) {
  if (!env.KV) return;
  try {
    await env.KV.put(`hist:${userId}`, JSON.stringify(history.slice(-(MAX_HISTORY * 2))), { expirationTtl: 60 * 60 * 24 * 7 });
  } catch (err) { console.warn('saveHistory:', err.message); }
}

async function clearHistory(userId, env) {
  if (!env.KV) return;
  try { await env.KV.delete(`hist:${userId}`); } catch {}
}

// ─── کانال (هر N پیام) ───────────────────────────────────────

async function channelSuffix(userId, env) {
  if (!env.KV) return '';
  try {
    const key = `cnt:${userId}`;
    const raw = await env.KV.get(key);
    const cnt = (raw ? parseInt(raw) : 0) + 1;
    await env.KV.put(key, String(cnt), { expirationTtl: 60 * 60 * 24 * 30 });
    return (cnt % SHOW_CH_EVERY === 0) ? `\n\n${CHANNEL_MSG}` : '';
  } catch { return ''; }
}

// ─── تلگرام API ──────────────────────────────────────────────

async function getTelegramFileUrl(fileId, env) {
  try {
    const res  = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
  } catch { return null; }
}

async function sendText(chatId, env, text, parseMode = null) {
  const payload = { chat_id: chatId, text: String(text).slice(0, MSG_LIMIT) };
  if (parseMode) payload.parse_mode = parseMode;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok && parseMode) await sendText(chatId, env, text, null);
  } catch (err) { console.error('sendText:', err.message); }
}

// ارسال عکس (از ArrayBuffer) به‌عنوان فایل multipart به تلگرام
async function sendPhotoBuffer(chatId, env, arrayBuffer, caption = '') {
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption.slice(0, 1024));
    form.append('photo', new Blob([arrayBuffer], { type: 'image/png' }), 'image.png');

    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: form
    });
    if (!res.ok) {
      const t = await res.text();
      console.error('sendPhotoBuffer failed:', t.slice(0, 200));
      await sendText(chatId, env, '🚫 ارسال عکس ناموفق بود.');
    }
  } catch (err) {
    console.error('sendPhotoBuffer:', err.message);
    await sendText(chatId, env, '🚫 خطا در ارسال عکس: ' + err.message);
  }
}

async function sendKeyboard(chatId, env, text, replyMarkup) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, MSG_LIMIT), parse_mode: 'Markdown', reply_markup: replyMarkup })
    });
    if (!res.ok) await sendText(chatId, env, text);
  } catch (err) { console.error('sendKeyboard:', err.message); }
}

async function sendAction(chatId, env, action = 'typing') {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action }) });
  } catch {}
}

async function answerCallback(callbackQueryId, env, text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: callbackQueryId, text }) });
  } catch {}
}

async function setWebhook(env) {
  try {
    const res  = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `https://${env.WORKER_DOMAIN}` }) });
    const data = await res.json();
    return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// ─── تبدیل داده ──────────────────────────────────────────────

function arrayBufferToBase64(buffer) {
  const bytes  = new Uint8Array(buffer);
  let   binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function getMimeFromUrl(url) {
  const ext = url.split('.').pop().toLowerCase().split('?')[0];
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' })[ext] || 'image/jpeg';
}
