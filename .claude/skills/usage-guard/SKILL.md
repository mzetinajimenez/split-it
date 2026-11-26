---
name: usage-guard
description: How split-it swarm sessions handle usage or rate limits and session expiry. Detect the limit, pause instead of retrying, schedule a wake-up for when the limit resets, and resume without losing work. The coordinator and every worker follow it; it is referenced from swarm-coordinator and implement-issue.
---

# Usage guard: limits, expiry, resume

Sessions can hit account usage or rate limits, and an idle container can be reclaimed. The
goal is to **never lose work and never burn usage on retries that will fail**. When the
limit resets, the swarm picks up where it stopped.

> There is no reliable API for "usage remaining". Act on the **signals** below, and be
> conservative.

## Signals that you're at or near the limit

- A `rate_limit_event` in a session's events (`list_events` with `kinds:
  ["rate_limit_event", "result"]`). If the event carries a reset or `retry-after` time,
  use it.
- A turn that ended in a usage-limit or rate-limit error, or a 429 / "usage limit reached"
  message in your own tool results.
- Several workers going `failed` / idle at about the same time with no code reason.
- The owner telling you that usage is low.

## Worker rules (all the time, not just near the limit)

1. **Checkpoint push often.** Commit and push to your branch after every meaningful step:
   a test passing, a component done. Use a `wip:` prefix if the step isn't green yet. A
   pushed branch survives expiry, a reclaimed container and a limit. Unpushed work doesn't.
2. **Keep a resume note.** As each step lands, keep a checklist under a `## Progress`
   heading in the PR body, or in a draft PR opened early, of what's done and what's next.
3. **When you hit a limit:** stop. Don't retry in a loop. Push whatever is committed, and
   update the progress note.
4. **On resume** (a coordinator message such as "limits reset, continue", or a new turn):
   - `git fetch` and check out your branch; never restart from scratch
   - read the progress note
   - merge `origin/main` if it moved
   - re-run the checks, then continue

## Coordinator rules

**Before every tick, check for signals** (§3 of swarm-coordinator). If you see one:

1. **Enter pause mode:**
   - start **no** new workers
   - send **no** nudges (they spend usage and will fail)
   - don't retry failed turns
2. **Work out the resume time:**
   - use the reset time from the event, plus 5 minutes
   - if there isn't one, check again in **60 minutes**, and back off to 2 hours after two
     paused checks
3. **Record the pause** in the #1 "Swarm status" comment:
   - `⏸ Paused for usage limits since <time>; next check <time>`
   - which workers were mid-task
4. **Schedule the wake-up** with `send_later` at the resume time. That is the only thing you
   do while paused.
5. **On wake:**
   - check one cheap signal first: your own turn works, and one worker's `get_session`
     responds
   - still limited: reschedule and go back to step 2
   - clear: resume, as below

**Resuming:**
- **Revive the existing workers before starting new ones.** Send each paused worker one
  message: "Limits reset. Fetch your branch, read your Progress note, merge `origin/main`
  if needed, and continue." A worker that won't respond, or whose session is gone, gets a
  fresh session on the **same branch** with the same `/implement-issue <n>` prompt; its
  pushed checkpoints carry the work.
- **Ramp the concurrency back up:**
  - for the first hour after a pause: max **2** workers, critical-path issues first
    (swarm-coordinator §1)
  - then return to the configured cap
  - if a second pause happens within 24 hours, lower the configured cap by 1 and tell the
    owner
- Update the status comment: `▶ Resumed <time>`.

## Proactive throttling (before you hit the wall)

- The **first** `rate_limit_event` that is only a warning (the turn still succeeded):
  - drop to 2 concurrent workers
  - finish the in-flight PRs before starting new issues
  - lengthen the tick interval to 30–40 minutes
- Prefer issues that unblock the most others, so that limited capacity moves the critical
  path forward.
- Don't keep idle workers alive just to wait: archive any worker whose PR merged, right
  away.

## Session expiry and container reclaim (not a usage limit)

- A reclaimed container loses everything that wasn't pushed. The checkpoint-push rule is
  what protects against it.
- A coordinator that comes back after expiry follows "Resuming" in swarm-coordinator. The
  #1 status comment and the pushed branches are the source of truth, not memory.
