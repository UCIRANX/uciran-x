export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // LOGIN → ساخت user + token
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

    // REFRESH → گرفتن user از روی refreshToken
    if (url.pathname === "/refresh") {
      const body = await request.json().catch(() => ({}));

      const userId = await env.DB.get(body.refreshToken);

      if (!userId) {
        return Response.json(
          { error: "invalid refresh token" },
          { status: 401 }
        );
      }

      // rotate token
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

    // AUTH TEST (برای تست کاربر)
    if (url.pathname === "/me") {
      const token = request.headers.get("Authorization");

      if (!token) {
        return Response.json({ error: "no token" }, { status: 401 });
      }

      // ساده: توکن رو مستقیم userId فرض نمی‌کنیم
      // (فعلاً فقط تستی)
      return Response.json({
        message: "auth endpoint working",
      });
    }

    return Response.json({
      status: "UCIRAN X API running",
    });
  },
};
