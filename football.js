// This is the "receptionist" — it runs on Vercel's servers, not in the browser.
// It receives requests from your app, adds your API key, calls football-data.org,
// and passes the answer back. Your key never reaches the public.

export default async function handler(req, res) {
  // Allow your frontend to call this receptionist
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { competition, type } = req.query;

  if (!competition || !type) {
    return res.status(400).json({ error: "Missing 'competition' or 'type' query param" });
  }

  // type is either "matches" or "standings"
  const validTypes = ["matches", "standings"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: "type must be 'matches' or 'standings'" });
  }

  const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "Server missing API key. Set FOOTBALL_DATA_API_KEY in Vercel." });
  }

  let url = `https://api.football-data.org/v4/competitions/${competition}/${type}`;
  if (type === "matches") {
    url += "?status=SCHEDULED";
  }

  try {
    const response = await fetch(url, {
      headers: { "X-Auth-Token": API_KEY },
    });

    if (response.status === 429) {
      return res.status(429).json({ error: "rate-limit" });
    }
    if (!response.ok) {
      return res.status(response.status).json({ error: "fetch-failed" });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "fetch-failed", detail: err.message });
  }
}
