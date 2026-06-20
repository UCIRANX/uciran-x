export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // LOGIN
    if (url.pathname === "/login") {
      const userId = crypto.randomUUID();

      const accessToken = crypto.randomUUID();
      const refreshToken = crypto.randomUUID();

      await env.DB.put(refreshToken, userId, {
        expirationTtl: 60 * 60 * 24 * 30,
      });

      return Response.json({
        accessToken,
        refreshToken,
      });
    }

    // REFRESH (ROTATION)
    if (url.pathname === "/refresh") {
      const body = await request.json().catch(() => ({}));

      const userId = await env.DB.get(body.refreshToken);

      if (!userId) {
        return Response.json(
          { error: "invalid or used refresh token" },
          { status: 401 }
        );
      }

      // 🔴 مهم: توکن قبلی حذف میشه (one-time use)
      await env.DB.delete(body.refreshToken);

      const newAccessToken = crypto.randomUUID();
      const newRefreshToken = crypto.randomUUID();

      // ذخیره refresh جدید
      await env.DB.put(newRefreshToken, userId, {
        expirationTtl: 60 * 60 * 24 * 30,
      });

      return Response.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    }

    // LOGOUT
    if (url.pathname === "/logout") {
      const body = await request.json().catch(() => ({}));

      if (!body.refreshToken) {
        return Response.json({ error: "missing refresh token" }, { status: 400 });
      }

      await env.DB.delete(body.refreshToken);

      return Response.json({
        status: "logged out",
      });
    }

    return Response.json({ status: "ok" });
  },
};
