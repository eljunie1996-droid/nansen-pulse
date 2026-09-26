# Hosted demo

Live demo: https://nansen-pulse.vercel.app/

The repository root runs locally using your own Nansen API key, as documented in README.md. The `hosted/` directory is the Vercel variant. Set Vercel Root Directory to `hosted` when importing this whole repository.

The hosted API requires server-side `NANSEN_API_KEY` and connected Upstash credentials (`KV_REST_API_URL` and `KV_REST_API_TOKEN`, or the equivalent `UPSTASH_REDIS_REST_*` variables). No demo password is required in this variant.

All hosted Nansen HTTP attempts reserve a shared quota slot before being sent. The limit is 300 calls per Vietnam calendar day. Missing/offline quota storage stops new requests. Failed Nansen attempts count. This is not a credit, dollar, Vercel-usage or Redis-usage limit. Calls elsewhere with the same key are outside this limiter.

Do not enable Redis eviction or delete daily quota keys. Response caches are per instance, not durable shared caches.

The live homepage, token inventory, and local search have been observed working. Mock tests cover quota admission and failures; these do not independently prove that the deployed Redis script stops at the daily limit. Do not exhaust the real quota merely to demonstrate that boundary.
