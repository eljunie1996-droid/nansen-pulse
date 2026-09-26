# Public deployment update

This supersedes DEPLOY.md: no demo password is required. NANSEN_API_KEY stays server-side. Connect pulse-quota to this Vercel project. The limiter accepts KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.

Every upstream Nansen HTTP attempt must atomically reserve one of 300 daily slots in Redis. Day boundaries use Vietnam time (UTC+7). Failed Nansen calls consume a slot. Missing or unreachable quota storage stops upstream requests. Do not enable eviction or delete quota keys.

This is a call limit, not a dollar/credit cap. It covers this hosted application only. Cache is per instance. No shared response cache or per-visitor rate limit is claimed. Hosting/Redis usage is separate.

Tests use mocks. Live Redis and hosted Nansen integration still need verification after deployment.
