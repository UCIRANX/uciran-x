export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================
    // PANEL
    // =========================
    if (url.pathname === "/") {
      return new Response(html(), {
        headers: { "content-type": "text/html" },
      });
    }

    // =========================
    // LOGIN (create user + key)
    // =========================
    if (url.pathname === "/login") {
      const userId = crypto.randomUUID();
      const apiKey = createKey();

      await saveKey(env, userId, apiKey);

      return Response.json({ userId, apiKey });
    }

    // =========================
    // CREATE SUBSCRIPTION LINK
    // =========================
    if (url.pathname === "/create-sub") {
      const body = await request.json().catch(() => ({}));

      const apiKey = body.apiKey;
      const userId = await env.DB.get(apiKey);

      if (!userId) {
        return Response.json({ error: "invalid api key" }, { status: 401 });
      }

      const subId = crypto.randomUUID().replaceAll("-", "");

      await env.DB.put("sub:" + subId, userId);

      return Response.json({
        subLink: `/sub/${subId}`,
      });
    }

    // =========================
    // SUBSCRIPTION OUTPUT
    // =========================
    if (url.pathname.startsWith("/sub/")) {
      const subId = url.pathname.split("/")[2];

      const userId = await env.DB.get("sub:" + subId);

      if (!userId) {
        return Response.json({ error: "invalid sub" }, { status: 404 });
      }

      // گرفتن همه key های user
      const keys = JSON.parse(await env.DB.get(userId + ":keys") || "[]");

      return Response.json({
        userId,
        apiKeys: keys,
        endpoints: {
          verify: "/verify",
          keys: "/keys",
          delete: "/delete-key",
        },
      });
    }

    // =========================
    // VERIFY API KEY
    // =========================
    if (url.pathname === "/verify") {
      const key = request.headers.get("x-api-key");
      const userId = await env.DB.get(key);

      if (!userId) {
        return Response.json({ error: "invalid key" }, { status: 401 });
      }

      return Response.json({ ok: true, userId });
    }

    // =========================
    // LIST KEYS
    // =========================
    if (url.pathname === "/keys") {
      const key = request.headers.get("x-api-key");
      const userId = await env.DB.get(key);

      if (!userId) {
        return Response.json({ error: "invalid key" }, { status: 401 });
      }

      const keys = JSON.parse(await env.DB.get(userId + ":keys") || "[]");

      return Response.json({ userId, keys });
    }

    // =========================
    // DELETE KEY
    // =========================
    if (url.pathname === "/delete-key") {
      const body = await request.json().catch(() => ({}));

      const key = body.apiKey;
      const userId = await env.DB.get(key);

      if (!userId) {
        return Response.json({ error: "invalid key" }, { status: 401 });
      }

      await env.DB.delete(key);

      let keys = JSON.parse(await env.DB.get(userId + ":keys") || "[]");
      keys = keys.filter(k => k !== key);

      await env.DB.put(userId + ":keys", JSON.stringify(keys));

      return Response.json({ ok: true });
    }

    return Response.json({ status: "ok" });
  },
};

// =========================
// HELPERS
// =========================
function createKey() {
  return "ucx_" + crypto.randomUUID().replaceAll("-", "");
}

async function saveKey(env, userId, apiKey) {
  await env.DB.put(apiKey, userId);

  let keys = JSON.parse(await env.DB.get(userId + ":keys") || "[]");
  keys.push(apiKey);

  await env.DB.put(userId + ":keys", JSON.stringify(keys));
}

// =========================
// PANEL UI
// =========================
function html() {
  return `
<!doctype html>
<html>
<head>
  <title>UCIRAN X Panel</title>
</head>
<body style="font-family:sans-serif;background:#111;color:#fff;text-align:center;">

<h2>UCIRAN X Panel</h2>

<button onclick="login()">Login</button>
<p id="out"></p>

<hr>

<input id="key" placeholder="API Key" />
<button onclick="createSub()">Create Subscription Link</button>

<p id="sub"></p>

<script>

let apiKey = "";

async function login() {
  const res = await fetch('/login');
  const data = await res.json();

  apiKey = data.apiKey;

  document.getElementById('out').innerText =
    "API KEY: " + apiKey;
}

async function createSub() {
  const key = document.getElementById('key').value || apiKey;

  const res = await fetch('/create-sub', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: key })
  });

  const data = await res.json();

  document.getElementById('sub').innerText =
    location.origin + data.subLink;
}

</script>

</body>
</html>
`;
}
