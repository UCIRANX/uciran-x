export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // LOGIN
    if (url.pathname === "/login") {
      const userId = crypto.randomUUID();

      const accessToken = crypto.randomUUID();
      const refreshToken = crypto.randomUUID();

      // ذخیره refresh token
      await env.DB.put(refreshToken, userId, {
        expirationTtl: 60 * 60 * 24 * 30, // 30 روز
      });

      return Response.json({
        accessToken,
        refreshToken,
      });
    }

    // REFRESH
    if (url.pathname === "/refresh") {
      const body = await request.json().catch(() => ({}));

      const userId = await env.DB.get(body.refreshToken);

      if (!userId) {
        return Response.json(
          { error: "invalid refresh token" },
          { status: 401 }
        );
      }

      return Response.json({
        accessToken: crypto.randomUUID(),
      });
    }

    return Response.json({ status: "ok" });
  },
};
