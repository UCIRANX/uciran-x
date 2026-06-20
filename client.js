export async function connect(subUrl) {
  const res = await fetch(subUrl);

  if (!res.ok) {
    throw new Error("Invalid subscription link");
  }

  const config = await res.json();

  console.log("✅ Connected to UCIRAN X");
  console.log("User ID:", config.userId);
  console.log("API Keys:", config.apiKeys);
  console.log("Base URL:", config.baseUrl);

  return config;
}
