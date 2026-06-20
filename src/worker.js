export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/login") {
      return Response.json({
        accessToken: crypto.randomUUID(),
        refreshToken: crypto.randomUUID(),
      });
    }

    if (url.pathname === "/refresh") {
      const body = await request.json().catch(() => ({}));

      if (!body.refreshToken) {
        return Response.json(
          { error: "refreshToken required" },
          { status: 400 }
        );
      }

      return Response.json({
        accessToken: crypto.randomUUID(),
      });
    }

    return Response.json({
      status: "UCIRAN X API running",
    });
  },
};
