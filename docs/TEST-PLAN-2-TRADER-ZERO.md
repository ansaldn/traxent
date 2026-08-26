# Test Plan 2 — Trader Zero

**Subject:** David (Account B — real, permanent)
**Written:** 2026-08-25
**Prerequisite:** Test Plan 1 complete, Critical defects triaged
**Duration:** ~12 weeks
**What it tests:** whether Traxent's central claim survives contact with its first genuine user

---

## 1. What this actually is

Test Plan 1 asks "does the software work?" This asks a harder question: **does the product do what it says it does?**

Traxent's claim, stated plainly, is: *a complete beginner can work through this curriculum and come out the other side prepared to pass a prop firm evaluation.* You are about to be the first test of that claim, and you are close to the ideal subject — a real beginner, not a pretend one, with genuine motivation and no prior trading knowledge to fall back on when the material is unclear.

That last part is the valuable bit. **Every time you don't understand something, that is data.** An expert reviewing this curriculum would skim past a gap without noticing it, because they'd fill it in from their own knowledge. You can't. That makes you a better instrument than a professional reviewer would be, and it means the most important thing you can do in this test is be ruthlessly honest about confusion instead of pushing through it.

---

## 2. Three things I want to be straight with you about first

I'd rather say these now than have them undermine the results later.

### 2.1 An n=1 test cannot prove the curriculum works

If you pass a funded evaluation, that will feel like proof. It isn't. Prop firm evaluations have a large luck component over a short evaluation window, and a single trader passing once is consistent with both "the curriculum is excellent" and "the curriculum is useless and you got a good month."

The reverse is also true, and matters more for your morale: **if you fail the evaluation, that does not mean Traxent failed.** Published pass rates for first-attempt prop firm challenges are low — commonly cited figures sit in the single-digit to low-teens percent range, though firms rarely publish audited numbers and you should treat any specific figure sceptically. A beginner failing a first attempt is the *expected* outcome regardless of preparation quality.

So we're not going to grade the curriculum on whether you get funded. **We're going to grade it on process.** Specifically: did the curriculum give you a defined process, did you follow it, and did following it produce the behaviour it promised? A trader who follows their rules perfectly and still fails on variance has been well taught. A trader who passes by abandoning their rules and getting lucky has been taught nothing. Phase 5 measures the first thing, not the second.

### 2.2 There is a scope problem you need to resolve before Phase 1

You've said the product has expanded to cover options, forex and company stocks. But everything I can see in the codebase — 16 firm pages, the readiness tracker, the sim journal, Challenge Lab's 30-day challenge, the entire "Going Live" module — is built around **prop firm evaluations**, which are overwhelmingly futures and forex.

That matters because the funded-trader model largely doesn't extend to the other two. Options prop firms are rare and structured very differently. Equities prop firms exist but are a different world from the retail-facing futures/forex firms Traxent lists. So there's a real risk that the curriculum teaches options and stocks, and then the "get funded" pathway quietly only applies to a subset of what was taught.

**Before you start Phase 1, answer this:** if a user completes the options material and then opens the tracker to find a firm, what happens? If the honest answer is "nothing useful", then either the funded pathway needs to be scoped explicitly to futures/forex in the copy, or the options and stocks material needs its own destination. Write your answer in the Phase 0 baseline. This is a product-strategy finding, and it's probably the most valuable thing this test surfaces that isn't a bug.

### 2.3 The money

Phase 5 involves buying a real prop firm evaluation. Typical entry fees run roughly £50–£250 depending on firm and account size, and that fee is **gone** whether you pass or fail. Some firms offer a free retry on a failed challenge; most don't.

I'm not a financial adviser and this isn't financial advice. What I'd ask you to do is decide the number **now**, before you're emotionally invested in the outcome, and write it down in Phase 0:

> Maximum I will spend on evaluation fees during this test: £________
> Number of attempts I will make before stopping: ________

The reason to fix it in advance is that the failure mode here isn't losing one entry fee — it's the second attempt, then the third, each one feeling like it'll be the one. Prop firm business models are built on that pattern. Deciding the limit while you're still in analyst mode, and treating it as non-negotiable once you're in trader mode, is the single most useful piece of risk management in this entire document. If you find yourself wanting to exceed it, that's a finding too — write it down rather than acting on it, because it means the psychology module didn't stick and that's exactly what we're here to learn.

Also: use a **sim/demo** account for everything in Phases 1–4. No real capital touches this test before Phase 5.

---

## 3. Instrumentation — how to record

Everything lives in one place. Create `docs/trader-zero-log/` in this repo, with these files:

| File | What goes in it |
|---|---|
| `00-baseline.md` | Phase 0. Written once, before anything. **Do not edit it later** — its value is that it's naive. |
| `01-lesson-log.md` | One entry per lesson. The main instrument. |
| `02-external-lookups.md` | Every time you leave Traxent to understand something. **The single most important file.** |
| `03-jargon.md` | Every term used before it's defined. |
| `04-trading-plan.md` | The artifact you produce in Phase 3. |
| `05-sim-journal.md` | Phase 4 narrative. Numbers live in the app; feelings live here. |
| `06-evaluation.md` | Phase 5 daily record. |
| `07-findings.md` | Running list of product findings that aren't bugs. |

### 3.1 The lesson log entry

After **every** lesson, before moving on, write four lines. It takes ninety seconds. Do not batch them at the end of a module — you'll unconsciously smooth over confusion once you've resolved it, and the confusion is the data.

```
### [Module X · Lesson Y] Title
Understood: 1-5
Could I explain this to someone else right now?  YES / NO / PARTLY
Confused by:  (blank if nothing)
Had to look outside Traxent:  NO / YES → logged in 02
```

The "could I explain it" question is deliberately harder than "did I understand it". Recognition feels like comprehension and isn't. If the answer is NO, the lesson has not landed, regardless of how clear it felt while reading.

### 3.2 The external lookup log — read this twice

**Every external lookup is a curriculum gap.** This is the core metric of the whole test.

If you have to Google what a pip is, or ask me what "slippage" means, or watch a YouTube video to understand order types — Traxent failed to teach that thing, and every future user will hit the same wall. Most of them won't be as motivated as you, and they'll churn instead of Googling.

Log every single one:

```
| Date | Module/Lesson | What I didn't understand | Where I went | Was Traxent's version wrong, missing, or just unclear? |
```

That last column is the one that turns a log into a fix list:
- **Missing** — Traxent never covered it. → Add content.
- **Unclear** — Traxent covered it, badly. → Rewrite content.
- **Wrong** — Traxent covered it incorrectly. → **Urgent.** Teaching a beginner something false about risk is the worst failure mode this product has.
- **Out of scope** — genuinely beyond what Traxent should teach. → Add a "further reading" pointer so the next user doesn't have to search blind.

### 3.3 A note on honesty

You built this. You will want it to be good. That's going to bias you toward marking things "understood" when you half-understood them, and toward not logging the Google search because it felt like a small one.

The strongest countermeasure is the "could I explain it" test, applied strictly. The second is this: **a test that finds nothing has failed.** If you finish Phase 2 with an empty external-lookup log, the most likely explanation isn't that the curriculum is perfect — it's that you didn't log properly. Treat a suspiciously clean log as a reason to re-examine your method, not as a result.

---

## Phase 0 — Baseline (1 day, before anything else)

Write `00-baseline.md` and don't look at it again until Phase 6.

**0.1 Honest self-assessment.** In plain prose, no bullet points, write 300–500 words on what you currently understand about trading. Where you're guessing, say so. Where you've absorbed something from the internet and aren't sure it's true, say so. This is the document that makes the "before and after" real.

**0.2 Diagnostic — answer without looking anything up.** Write your answer even when it's "no idea":

1. What is a pip, and what is a tick?
2. If you have a £50,000 account and want to risk 1% on a trade with a 20-pip stop, how big is your position?
3. What is the difference between a market order and a limit order?
4. What does a 5% daily drawdown limit mean, exactly? When does the day reset?
5. What is leverage, and what does 1:100 mean in practice?
6. What is a risk-to-reward ratio, and what R:R do you need to be profitable at a 40% win rate?
7. Name three things that would cause a prop firm to fail you instantly.
8. What is the spread, and who pays it?
9. What is a call option? What is a put?
10. What's the difference between trading a company's stock and trading a CFD on it?
11. Why do most retail traders lose money?
12. What would make you close a trade early?

Keep the raw answers. You'll re-answer these cold in Phase 6.

**0.3 Motivation and stop conditions.** Write down:
- Why do you want to be a funded trader? (Be honest. "It's the product I built" is a valid answer and a different one from "I want trading to be my income".)
- Maximum total spend on evaluation fees: £________
- Maximum number of attempts: ________
- What would make you stop entirely?

**0.4 The scope question** from §2.2. Write your answer.

**0.5 Time budget.** Hours per week you'll realistically commit: ________
Then track the actual figure. If the real number is half the planned one, that's a finding about the curriculum's pacing assumptions, not a personal failing.

---

## Phase 1 — Onboarding as a stranger (1 day)

Create **Account B** at `traxent.io`. Your real, permanent account.

The test here is narrow: **can a stranger who lands on this site work out what it is and what to do next?** You have five minutes of pretending you've never seen it before. Use them well, because you can only do this once.

| # | Question | Record |
|---|---|---|
| 1.1 | Land on `traxent.io`. Set a 60-second timer. When it goes off, write down — without scrolling back — what you think Traxent does and who it's for. | |
| 1.2 | Is it clear that Traxent does **not** give you a funded account, and that you get funded by a third-party firm? | Y/N + where you learned it |
| 1.3 | Read the pricing. Which tier would a stranger pick, and why? | |
| 1.4 | Sign up. Count the steps and note anything that made you hesitate. | |
| 1.5 | After signup you land on `/home`. **What do you do next?** Is it obvious? | |
| 1.6 | Is there any onboarding — a welcome sequence, a first-lesson nudge, a "start here"? | There is no onboarding wizard. Record what that feels like from a standing start |
| 1.7 | Find `/learn` and start Module 1. How many clicks from signup? | |
| 1.8 | Did anything you saw promise something the product doesn't do? | Cross-reference Test Plan 1's K-21 and A-05 |

**Findings from Phase 1 go in `07-findings.md`, not the defect registers** — these are product/UX findings, not bugs.

---

## Phase 2 — The curriculum (6–8 weeks)

The main event. Work through **every module, in order, at honest pace.** Do not skip ahead. Do not skim material you think you already know — the point is to test the teaching, not your prior knowledge.

### Rules

1. **Log after every lesson.** Ninety seconds. No batching.
2. **Log every external lookup**, however small.
3. **Take every quiz on the first attempt without revising.** A quiz you can only pass on retry after re-reading is telling you the lesson didn't teach it. Record first-attempt scores separately from eventual scores.
4. **Don't ask me to explain trading concepts during Phase 2.** If you ask me, log it as an external lookup and I'll answer — but the asking is the data point. Traxent will not be there for the next user.
5. **Track time per module.** Compare to whatever the module claims.

### Per-module rollup

At the end of each module, before the quiz, write:

```
## Module X — rollup
Time spent (planned vs actual):
First-attempt quiz score:
Lessons where "could I explain it" = NO:
External lookups triggered:
Undefined jargon:
What this module was *for*, in one sentence, in my own words:
Did it connect to the module before it?
One thing I'd change:
```

That "what was it for, in one sentence" question is doing a lot of work. If you can't write it, the module has no thesis, and no amount of polish on individual lessons will fix that.

### Known issues that will affect Phase 2

From Test Plan 1's findings. **Don't file these again** — just work around them and note the impact on your experience:

- Your progress on Module 1 (`/learn-101`) will likely never show as complete (F-01).
- Individual lesson ticks probably won't register; only quiz completions will (F-03).
- Progress won't appear if you switch browsers or devices (F-06).
- Module numbering in the UI doesn't match the underlying files (F-08).
- Web and iOS may have different module counts (F-09).

**But do record how much these damage the experience.** "Progress tracking is broken" is a bug. "I lost motivation in week 3 because the site kept telling me I'd completed nothing" is a *product* finding, and it's the more serious one. Note your motivation level weekly, 1–5.

### Specific things to watch for

- **Risk material taught before it's needed.** Position sizing and drawdown rules must land *before* anything that encourages you to place trades. If you learn to enter a trade before you learn how much to risk, the curriculum is in the wrong order and it's teaching a beginner to be dangerous.
- **The options and stocks material.** Does it connect to the funded pathway, or does it sit apart? (§2.2.)
- **Psychology placement.** Challenge Lab puts psychology in Week 1. Does the curriculum teach it before you've had a losing trade, when it's abstract, rather than when it would bite?
- **Anything presented as certain that isn't.** Flag any claim about win rates, expected returns, or "this setup works" that isn't hedged. Overconfident teaching is a real harm to a beginner risking money.

---

## Phase 3 — Can I actually do it? (1 week)

Curriculum done. **Close Traxent.** Everything in this phase must come from what you now know, using only the tools, not the lessons.

This phase is the real test of Phase 2. Comprehension while reading is cheap. Production is expensive.

| # | Task | Pass condition |
|---|---|---|
| 3.1 | Using only `/tracker`, choose the prop firm best suited to you. Write down why, in your own words, referencing specific rules. | You can justify the choice without re-opening a lesson |
| 3.2 | Write out that firm's rules from memory. Then check. | Profit target, daily loss limit, max drawdown, min trading days, and any prohibited activity — all correct |
| 3.3 | Using `/calculator`, size a position for a £50k account, 1% risk, given stop distance. Then do it **by hand** and check the calculator agrees. | Both match. You understand *why* |
| 3.4 | Write your **trading plan** into `04-trading-plan.md`. Instruments, session times, setup criteria, entry trigger, stop placement, target, risk per trade, max daily loss, max concurrent positions, and the conditions under which you stop trading for the day. | It's specific enough that someone else could follow it without asking you a question |
| 3.5 | Write down what you'd do after three consecutive losses. | An actual rule, not a feeling |
| 3.6 | Explain to me, out loud, what happens if you breach the daily loss limit by £1. | Correct and immediate |
| 3.7 | Open a **demo** account with your chosen firm's platform and place one trade following your plan exactly. | You can operate the platform. This is the "can I actually create a trading account myself" test |

**3.4 is the deliverable that matters most.** If you cannot write a specific, followable trading plan after completing the entire curriculum, then Traxent teaches *about* trading rather than teaching *how to trade* — and that gap is the biggest possible finding in this document. Be honest about how hard it was.

Also record: **how much of 3.1–3.7 did you have to look up?** Log it in `02-external-lookups.md` like everything else. Lookups at this stage are worth more than lookups in Phase 2, because they identify things the curriculum taught but didn't make *usable*.

---

## Phase 4 — The 30-day sim challenge (4–5 weeks)

Run Challenge Lab's Week 4 sim challenge properly, in `/journal`, on a demo account. No real money.

### Rules

- **Follow your Phase 3 trading plan exactly.** Every deviation is a finding.
- Log every trade in `/journal` on the day you take it.
- Every evening, write three lines in `05-sim-journal.md`: what you did, whether you followed the plan, and how you felt.
- Do not change your plan mid-challenge. If you want to, write down *why* and keep trading the original. Wanting to change the plan after losses is precisely what the psychology module exists to prevent, and catching yourself doing it is worth more than a clean run.

### What we're measuring

| Metric | Why it matters |
|---|---|
| **Plan adherence rate** (trades following plan ÷ total trades) | The single most predictive number in this phase. Below ~85% means you are not ready, whatever the P&L says |
| Number of rule breaches (would have failed the firm) | |
| Readiness score at day 30 | And whether it agrees with your own honest assessment |
| Did you ever want to revenge-trade? Did you? | |
| Did you follow your stop-loss rules under pressure? | |
| Longest losing streak, and what you did during it | |

### Product tests inside Phase 4

- **Does the readiness score mean anything?** At day 30, before looking at it, write down your own 0–100 estimate of readiness. Then compare. **If the app's score is materially higher than your honest self-assessment, that's a serious finding** — a product that tells beginners they're ready when they aren't is actively harmful, because it pushes them toward spending money on an evaluation they'll fail.
- Does the daily-limit and drawdown arithmetic in `/journal` match the firm's actual rules? (Test Plan 1 G-05 checks the maths; this checks whether it matches *reality*.)
- Do the journal prompts help, or are they friction?
- Did the weekly readiness digest email arrive, and did it tell you anything you didn't know?

### The gate

**Do not proceed to Phase 5 unless all three are true:**

1. Plan adherence ≥ 85%.
2. Zero breaches that would have failed the evaluation.
3. Your own honest self-assessment says you're ready — independent of what the app says.

If any is false, **stop.** Repeat Phase 4, or go back to the modules the failures point at. That's not a setback; it's the product working. A curriculum whose readiness gate lets an unready trader through and take their money isn't a curriculum, it's a funnel — and if Traxent's gate lets *you* through when you know you're not ready, that is the finding of the entire test and it needs fixing before another human uses this.

---

## Phase 5 — The real evaluation

Only after Phase 4's gate. Only within the budget you fixed in Phase 0.

### Before you pay

- [ ] Re-read your Phase 0 budget line. Are you still inside it?
- [ ] Read the firm's rules **in full, on the firm's own site.** Do not rely on Traxent's summary — Traxent's firm data is stamped `updated: 2026-06-10` and rules change. **If Traxent's data disagrees with the firm's site, that's a High-severity finding and you should file it immediately**, because every user is being shown stale rules they'll be evaluated against.
- [ ] Confirm the payment is a fee you're prepared to lose.
- [ ] Confirm your Phase 3 trading plan hasn't quietly drifted.

### Daily record in `06-evaluation.md`

```
Day N
Trades: 
Followed plan: Y / N — if N, what and why
P&L:
Distance to profit target:
Distance to daily loss limit:
Distance to max drawdown:
How I felt:
Did Traxent prepare me for what happened today? What was missing?
```

That last line is the one that matters for the product. Every day of a real evaluation is a stress test of the curriculum, and the gaps show up under pressure that never showed up while reading.

### Outcomes and what each means

| Outcome | What it tells us about Traxent |
|---|---|
| **Pass, plan adherence high** | The strongest available evidence, still only n=1. Do not over-claim it in marketing |
| **Pass, plan adherence low** | You got lucky. The curriculum is unvalidated and the readiness gate is too loose |
| **Fail on variance, adherence high** | **The curriculum probably worked.** You did what you were taught and the market didn't cooperate. This is the expected outcome and it is not a failure of the product |
| **Fail on a rule breach** | The curriculum did not make the rules stick. Directly actionable: which rule, which module, why didn't it land |
| **Fail on psychology** — revenge trading, oversizing after losses, moving stops | **The most important failure mode.** It means the material was understood and not internalised, which is a teaching-method problem, not a content problem. Would change how the whole psychology track is built |

**Stop at your Phase 0 attempt limit.** If you're at the limit and want one more, write down what you're feeling and don't take it. Then read what you wrote. That entry will teach you more about trading psychology than the module did, and it belongs in `07-findings.md`.

---

## Phase 6 — Verdict (2 days)

**6.1 Retake the Phase 0 diagnostic cold.** Same twelve questions, no notes, no looking up. Then diff against your Phase 0 answers. **This is your headline number: how many did you get right before, and how many after?**

**6.2 Re-read `00-baseline.md`.** You haven't looked at it in three months. What does it feel like now?

**6.3 The metrics that matter:**

| Metric | Value |
|---|---|
| Diagnostic: before → after | ___ / 12 → ___ / 12 |
| Total external lookups | ___ (target: as close to zero as possible) |
| Of those, **Wrong** (Traxent taught something false) | ___ (**target: zero. Any non-zero number is urgent**) |
| Of those, **Missing** | ___ |
| Lessons where "could I explain it" = NO | ___ / ~60 |
| First-attempt quiz average | ___% |
| Undefined jargon terms | ___ |
| Could I write a followable trading plan unaided? | Y / N |
| Sim plan-adherence rate | ___% |
| App readiness score vs my own honest estimate | ___ vs ___ |
| Did I get funded? | Y / N |
| **Did I follow my own process?** | Y / N ← *the real result* |

**6.4 Answer the three questions this whole test exists to answer:**

1. **Can a genuine beginner get from zero to evaluation-ready using only Traxent?** Yes / No / Yes but —
2. **Where does the curriculum break?** Ranked list of the top five gaps, from the lookup log.
3. **Would you recommend it to a friend with £200 and no experience?** If not, what specifically would have to change first?

**6.5 The uncomfortable one.** If the honest answer to 6.4.1 is "no", say so in writing. You built this to share, and shipping something that takes a beginner's money and leaves them unprepared to risk more of it is worse than shipping nothing. Finding that out now, from your own test, at a cost of one evaluation fee, is a good outcome — much better than finding out from a customer.

I'd also say this: the most likely honest answer is "yes, but —", and the interesting work is entirely in the "but". Don't let the binary framing flatten it.

---

## Appendix — Working agreement between us

**During Phase 2, don't ask me to explain trading concepts.** If you do, I'll answer, but log it as an external lookup — because the fact that you needed to ask is the finding.

**Do bring me anything else at any time.** Bugs, product findings, "is this normal", "does this rule mean what I think it means" about the *firm's* rules rather than trading concepts — all fine.

**At the end of each phase, bring me the logs.** I'll analyse them, sort findings into curriculum gaps versus bugs, and route bugs to the right register.

**I'll push back if the numbers say something you don't want to hear.** That's the job. It's also the whole reason to run a test rather than assume.

---

## Related documents

- `TEST-PLAN-1-SYSTEM-E2E.md` — run this first
- `DEFECTS-WEB-BACKEND.md` — web and backend defect register
- `../../traxent/Traxent Application/traxentApp/docs/DEFECTS-IOS.md` — iOS defect register
