// Exchanges the server-side Cloudflare TURN API token for a short-lived ICE
// servers config that's safe to ship to the browser. Called once per boardroom
// session.
//
// Requires two env vars in Vercel (Production):
//   CF_TURN_TOKEN_ID    — public-ish, identifies the TURN App
//   CF_TURN_API_TOKEN   — SECRET, never leaves the server
//
// Cloudflare's response already includes both STUN and TURN entries with
// ephemeral username/credential, formatted for RTCPeerConnection.iceServers,
// so the client just passes it through verbatim.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const tokenId = process.env.CF_TURN_TOKEN_ID;
  const apiToken = process.env.CF_TURN_API_TOKEN;

  if (!tokenId || !apiToken) {
    res.status(500).json({ error: 'turn_not_configured' });
    return;
  }

  try {
    const cf = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        // 24h is Cloudflare's max TTL and matches the longest plausible session.
        body: JSON.stringify({ ttl: 86400 }),
      },
    );

    if (!cf.ok) {
      const detail = await cf.text();
      res.status(502).json({ error: 'cf_api_error', status: cf.status, detail });
      return;
    }

    const data = await cf.json();
    if (!data?.iceServers) {
      res.status(502).json({ error: 'cf_unexpected_shape' });
      return;
    }

    // Short browser cache so quick re-mounts of the boardroom don't hammer the
    // Cloudflare API — but well under the 24h TTL.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.status(200).json({ iceServers: data.iceServers });
  } catch (err) {
    res.status(500).json({ error: 'fetch_failed', detail: String(err) });
  }
}
