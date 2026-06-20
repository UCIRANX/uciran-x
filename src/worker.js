export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // LOGIN (همون قبلی)
    if (url.pathname === "/login") {
      const userId = crypto.randomUUID();

      const accessToken = crypto.randomUUID();
      const refreshToken = crypto.randomUUID();

      await env.DB.put(refreshToken, userId, {
        expirationTtl: 60 * 60 * 24 * 30,
      });

      return Response.json({
        userId,
        accessToken,
        refreshToken,
      });
    }

    // CREATE API KEY
    if (url.pathname === "/create-key") {
      const body = await request.json().catch(() => ({}));

      if (!body.userId) {
        return Response.json({ error: "userId required" }, { status: 400 });
      }

      const apiKey = "ucx_" + crypto.randomUUID().replaceAll("-", "");

      await env.DB.put(apiKey, body.userId);

      return Response.json({
        apiKey,
      });
    }

    // VERIFY API KEY (middleware test)
    if (url.pathname === "/verify") {
      const apiKey = request.headers.get("x-api-key");

      if (!apiKey) {
        return Response.json({ error: "missing api key" }, { status: 401 });
      }

      const userId = await env.DB.get(apiKey);

      if (!userId) {
        return Response.json({ error: "invalid api key" }, { status: 401 });
      }

      return Response.json({
        ok: true,
        userId,
      });
    }

    // REFRESH TOKEN
    if (url.pathname === "/refresh") {
      const body = await request.json().catch(() => ({}));

      const userId = await env.DB.get(body.refreshToken);

      if (!userId) {
        return Response.json({ error: "invalid refresh token" }, { status: 401 });
      }

      await env.DB.delete(body.refreshToken);

      const newAccessToken = crypto.randomUUID();
      const newRefreshToken = crypto.randomUUID();

      await env.DB.put(newRefreshToken, userId, {
        expirationTtl: 60 * 60 * 24 * 30,
      });

      return Response.json({
        userId,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    }

    return Response.json({
      status: "UCIRAN X API running",
    });
  },
};
