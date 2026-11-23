---
title: A per-IP bad-key lockout blocks every user behind an AI agent platform
date: 2026-11-22
category: docs/solutions/security-issues/
module: zack
problem_type: security_issue
component: authentication
symptoms:
  - Valid Zack keys get 429 on Sunday evening
  - A few members with stale keys cause a whole platform's members to miss a week
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [rate-limit, api-keys, shared-ip, agents, availability, lockout]
---

# A per-IP bad-key lockout blocks every user behind an AI agent platform

## Problem
The first Zack endpoint checked "has this IP sent ten wrong keys this minute?" before looking up the key, and refused everything from that IP if so. But the callers are hosted AI agents (Claude, Grok Bot, Duet, Hark). Their requests come from each platform's shared egress IPs, and every member's Zack fires at about the same moment (Sunday 6:00 PM). A handful of members with replaced or mistyped keys, or one person asking an agent to fetch the URL with a junk key, locked out every valid member on that platform. Zack treats a refused send as "keep the files until next week", so each blocked member missed a whole week.

## Symptoms
- 429s for valid keys, clustered at the scheduled send time.
- The plan's own test ("the eleventh wrong key from one IP is refused before any lookup") asserted the harmful behaviour.

## What Didn't Work
- "Refuse before lookup" as a brute-force defence. Keys are 256-bit; guessing is not the threat, so the gate only costs availability.

## Solution
Look the key up first. A valid key always works. Count only wrong keys per IP, and refuse only wrong keys once the IP is over the limit. Do not count requests with no key at all (link previews, browsers):

```ts
const key = keyFrom(request);
if (!key) return bare(401);
const user = await userForKey(q, key);
if (user) return user;
return (await hit(`zack:badkey:${ip}`, limits.zackBadKeyPerIp, now, counterFor(q))) ? bare(401) : bare(429);
```

## Why This Works
The lookup is one indexed query on a hash, so doing it first costs nothing. Legitimate traffic is never judged by what other people on the same IP did.

## Prevention
- For any endpoint called by agents, crawlers or webhooks from shared infrastructure, never let per-IP state refuse an otherwise valid credential.
- Rate-limit by credential (sends per key) for legitimate use, and by IP only for failures.
- Count only requests that pass validation against a user's own quota, and give test traffic its own allowance.

## Related Issues
- `src/lib/zack/key.ts` (`authenticate`), `src/lib/zack/key.test.ts`
- Stripe webhooks and the sign-in endpoint have the same shared-IP shape; their limits are per email and per signature, not per IP alone.
