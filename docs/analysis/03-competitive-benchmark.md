# Competitive benchmark: runner training products versus POC3

**Status:** Final draft for review (shared task `task-3`) · **Analysis date:** 2026-11-18 · **Product under analysis:** POC3, private proof of concept (calendar-first AI coach for runners) · **Scope:** 12 competitor products and 6 adjacent behaviours/substitutes · **Owner:** competitive intelligence · **Write scope:** this file only; no source, test, data or other docs were modified.

> **One-line finding.** POC3 is not competing with one product. It competes with a stack runners already assemble: a free Garmin or Nike plan, Strava's log and social graph, a spreadsheet or PDF, WhatsApp, and occasionally a human coach. POC3's only defensible wedge is the one thing that stack cannot do: a coach that edits the runner's actual calendar, with validation, guardrails and undo.

---

## 0. Header: method, evidence legend, confidence, limitations

### 0.1 What this document is, and what it is not

This is a decision aid, not a product review. It answers four questions:

1. What do the 12 most relevant products actually do (documented), and what do runners say about whether it works (reported)?
2. Where is POC3 genuinely alone, at parity, or behind?
3. Which gaps are real opportunities for a calendar-first AI coach, and which are table stakes POC3 must simply match?
4. Which POC3 non-goals are strategic liabilities rather than focus?

It is **not** a hands-on trial. No competitor account was created, no paid plan was purchased, no app was installed, and no paywalled page was circumvented. POC3 behaviour is taken from the repository's shipped-feature documentation (`README.md`, `docs/FEATURES-FOR-REVIEW.md`, `docs/POC3-CALENDAR.md`, `docs/COACH-STATES.md`, `docs/TRAINING-LOG-PLAN.md`), not from fresh end-to-end testing.

### 0.2 Evidence legend

| Code | Evidence type | What it can support | What it cannot support |
|---|---|---|---|
| **[V]** | Vendor product or pricing page | That a feature/price is advertised on the access date | That the feature works well, or that the price applies in every region |
| **[H]** | Vendor help center | Documented behaviour, limits, plan structure | Independent quality; help pages can lag releases |
| **[P]** | Vendor press release | Dated corporate claim (launch, acquisition, metric) | Independent verification of the claim |
| **[R]** | Independent review / news / expert analysis | Informed assessment, often hands-on | Systematic evidence; reviewers have audiences and biases |
| **[C]** | Community thread (Reddit, vendor forum) | Recurring complaint/praise; vocabulary; workarounds | Prevalence; threads are self-selected and often adversarial |
| **[X]** | Third-party comparison or pricing page | Corroboration of a price or tier | Neutrality; many are affiliate- or product-led |
| **[A]** | App-store listing | Availability, stated in-app purchase prices | Quality; ratings are not used here as a quality metric |
| **[M]** | Vendor marketing metric | That the vendor makes the claim | Causality; vendor metrics are usually observational |

### 0.3 Confidence scale

| Level | Meaning in this document |
|---|---|
| **High** | Documented on a vendor page/help center and, where relevant, corroborated by an independent source or multiple community reports. Price/feature captured on 2026-11-18. |
| **Medium** | One credible source, or a vendor claim plus partial corroboration; details may vary by region, plan tier, device or date. |
| **Low** | Single community post, search-index snippet, or commercially motivated comparison; directionally useful, not decision-grade alone. |
| **Unknown** | Not documented, not tested, or contradictory sources. Marked `?` in the matrix and never counted as an absence. |

### 0.4 Method

- **Corpus:** 68 distinct URLs in the source ledger (§9), including vendor pricing pages, help centers, press releases, independent reviews, subreddit threads and vendor forums.
- **Search and fetch:** `web_search`, `serper_search` (`search`/`webpage`) and `web_fetch`. When a page was JavaScript-heavy or navigation-heavy, I used the search-index summary and say so in the ledger's reliability column.
- **Date discipline:** every price and feature claim is stated as of **2026-11-18**, the access date. Where a page carries its own update date, that date is shown in the ledger.
- **Quotes:** short paraphrases only; no fabricated quotations. Direct quotation marks are reserved for wording visible in a fetched page or scraped thread.
- **POC3 truth:** feature status comes from the repo's own documents, including explicit "implemented", "partially implemented", "open" and "non-goal" labels. I did not infer features from screenshots.
- **No triangulation theatre:** repeated vendor claims count as one source, not two.

### 0.5 Limitations (read before using any number)

1. **Marketing pages overstate.** "Adaptive", "personalised" and "AI coach" mean different things across these products. I separate *documented feature* from *reviewer says it works well* throughout.
2. **Pricing changes by region, currency, tax and promotion.** Strava's own page says prices are now country-specific; Runkeeper's official page and third-party listings disagree; TrainingPeaks' page showed a promotional banner. Treat every price as a dated snapshot, not a universal truth.
3. **Reviews are self-selected.** Subreddit threads over-represent strong opinions, power users and people with an axe to grind. They are evidence of *what can go wrong* and *what runners care about*, not of prevalence.
4. **Vendor forums are not neutral.** The Athletica forum review is answered by Athletica staff; the Intervals.icu forum is full of power users; the Runna subreddit is explicitly a fan community.
5. **AI features are moving targets and often beta.** Garmin says Active Intelligence is "currently releasing in beta"; Strava's Athlete Intelligence launched as a public beta; COROS's AI plan-writing capability is dated to 21 September 2026. Capability claims can be stale within weeks.
6. **Some pages were region-locked or JS-heavy.** The Google Calendar and WhatsApp FAQ pages returned Chinese-locale content; Nike and Humango marketing pages returned only summary text; Final Surge's pricing page did not render prices to the crawler. These are flagged, not silently patched.
7. **POC3 is a private PoC.** It has no pricing, no mobile app, no payments and synthetic demo data. "Behind" in this document means "behind for a commercial runner product", not "behind for a PoC".
8. **No user interviews.** Personas and segment weights come from the companion research (`docs/analysis/02-runner-needs-research.md`); this document only links competitor evidence to those needs where the link is explicit.

### 0.6 Executive summary (the 10 findings that matter)

1. **The market has four product families, not one:** device-first coaches (Garmin, COROS), coach platforms (TrainingPeaks, TrainingPeaks Coach, Final Surge), AI-plan apps (Runna, Athletica, Humango), and social-logging apps (Strava, Nike Run Club, Runkeeper). Intervals.icu is a fifth, power-user analytics platform. POC3 does not fit any of them cleanly; that is both the opening and the risk.
2. **AI is mostly read-only across the market.** Strava's Athlete Intelligence writes a summary on an activity [S17]; Garmin's Active Intelligence "talks. You listen." with no reply box [S34]; Athletica explicitly says its AI Coach "does not automatically modify your training" [S54]; Runna's AI is post-run Workout Insights [S28]. The only competitor that lets AI *write* structured plans/calendar entries is COROS, and only through an external MCP assistant, with limits: 4–16-week plans, start date within 14 days, no delete via AI [S46].
3. **POC3's true differentiator is not "AI coach" — it is "AI coach that edits the calendar with proof".** Natural-language add/move/delete/revert, server validation, before/after change sets, undo, hidden directives and an audit page are not a combination any of the 12 ships natively. This is the strongest claim in this document and the one with the clearest failure modes (§7, O1/O4).
4. **Garmin sets the free floor.** Garmin Coach delivers "free custom plans" [S31] and DSW are generated on compatible watches/Edge [S29]. Garmin Connect+ adds AI summaries for $6.99/month or $69.99/year [S32], but reviewers describe the AI as one-way and low-insight [S33][S34]. POC3 cannot charge for "AI insights" alone; that is already free or cheap.
5. **Runna is the strongest paid AI-plan app and is now Strava-owned.** Runna costs $119.99/year [S25], pushes structured workouts to Garmin/Apple/COROS/Fitbit/Suunto [S19][S25], and is iterating fast (20+ features in 2026; Holiday Mode, seven-day plans, new Home tab) [S15]. Reviewers praise structure and convenience but report aggressive paces, opaque adaptation and calendar-cleanup bugs [S26][S27].
6. **TrainingPeaks owns the coach workflow; Final Surge owns the cheap coach workflow.** TrainingPeaks Premium is $19.95/month or $134.99/year with a free Basic account [S3]; Coach Edition starts at $21.99/month [S2]; Coach Match human coaching is $149–$359/month [S6]. Final Surge is free for athletes and $19/$39 per month for coaches [S21][S22]. Neither offers a native conversational coach that writes the calendar.
7. **Strava is the distribution and social layer, not a training-plan product.** Running plans moved to Runna effective 10 July (page dated 17 September 2026) [S12]; cycling plans remain fixed 4-week, 5-workout email plans [S13]. Strava's AI summaries are subscriber-only, mobile-only and can be hidden [S17]; users call them useless and ask for a coach that adjusts the plan [S18]. Strava now connects read-only to Gemini and Claude [S16].
8. **Intervals.icu is the free power-user benchmark.** Free, with a $4/month supporter tier, drag-and-drop calendar, plan editor, custom zones and an MCP connector for the runner's own AI [S49][S50][S52]. It has no official mobile app [S51]. It is the product most likely to make a data-literate runner ask why POC3 exists.
9. **Runners still run their week outside these products.** They use Google Calendar, Sheets, PDF plans, WhatsApp/Telegram groups and Reddit plan critique because no product owns "my actual week" end to end [S60]–[S67]. This is the demand-side evidence for POC3's calendar-first bet, and the reason "another plan app" is not enough.
10. **POC3 is ahead on conversational control, behind on the table stakes.** It is ahead on calendar-write coaching, guardrailed states, executed-workout overlay and auditability. It is behind on mobile, reminders, plan templates, export, wearable breadth, strength, social/community, coach view, race-day logistics, onboarding and a business model. The next section quantifies that honestly.

### 0.7 Market map used in this document

| Family | Products in this benchmark | What the runner buys | Where the plan lives | POC3 relationship |
|---|---|---|---|---|
| Device-first coach | Garmin Coach/DSW, COROS Training Hub | A watch plus free/cheap coaching | Watch + vendor app/web | POC3 reads Garmin execution but cannot read the future Garmin plan |
| Coach platform | TrainingPeaks, TrainingPeaks Coach Edition, Final Surge | A coach's workflow, or a place to self-coach | Coach's calendar, synced to device | POC3 has no coach view; this is a non-goal and a market gap |
| AI-plan app | Runna, Athletica AI, Humango | A generated, adapting plan and app coaching | Vendor app calendar | POC3's closest competitors on "AI plan", furthest on calendar writes |
| Social-logging app | Strava, Nike Run Club, Runkeeper | Recording, comparison, community, light plans | Activity feed + email/app plan | POC3 is deliberately private and social-free; that is a niche, not parity |
| Power-user analytics | Intervals.icu | Free depth and data ownership | Web calendar + charts | POC3 matches some depth, loses on breadth and price |

---

## 1. Competitor profiles

Each profile is 12–20 lines and follows the same eight questions: positioning, core workflow, pricing model, target runner, standout strengths, evidence-based weaknesses, what POC3 can learn, what not to copy. "Documented" means a vendor page/help center says it; "reviewer" means a user or journalist reports it.

### 1.1 TrainingPeaks (athlete product)

- **Positioning.** "Your complete training platform" for data-driven endurance athletes: calendar, Annual Training Plan (ATP), workout analysis, device sync and a coach connection [S1][S4][S8].
- **Core workflow.** The athlete gets a plan (self-built, purchased, or coach-assigned) → sessions land on the calendar → structured workouts sync to the device → the activity returns with TSS → CTL/ATL/TSB and Peak Performances update → the athlete comments and the coach replies [S1][S4][S5].
- **Pricing model.** Free Basic account; Premium at $19.95/month or $134.99/year (effective $11.25/month annual; 14-day trial). Premium adds planning tools, device sync, strength tools, Peak Performances and coach communication [S1][S3].
- **Target runner.** Self-coached runners/triathletes who like metrics and periodisation, and coached athletes whose coach uses TrainingPeaks.
- **Standout strengths (documented).** Deep load model (TSS/CTL/ATL), ATP periodisation, a real calendar, strength-training tools, Peak Performances, calendar export to Google/Outlook/Apple (Premium) [S1][S4][S8].
- **Evidence-based weaknesses.** Premium gates basic schedule moves that users think should be free; the platform is complex; running TSS can be calculated from power, pace or HR and users are told to troubleshoot "unrealistically high or low" values [S5][S7]. One user compares it unfavourably to Intervals.icu on features-per-dollar [S7]. Its public positioning is plans, coach directory and Coach Match, not a verified conversational calendar coach [S1][S4][S6].
- **What POC3 can learn.** The calendar is the anchor; periodisation needs a visible block (ATP); coach handoff is a product, not a feature; export/ICS is expected by serious users [S4].
- **What not to copy.** Paywalling basic rescheduling; metric density without explanation; making the runner learn TSS variants before trusting the plan.
- **Confidence.** High on features/prices; medium on user sentiment (small subreddit sample).

### 1.2 TrainingPeaks Coach Edition

- **Positioning.** An operating system for coaches plus a coach marketplace: Coach Edition bundles athlete accounts, coach tooling and the Coach Match service [S2][S6].
- **Core workflow.** The coach builds workouts/plan libraries → assigns them to athlete calendars → the athlete syncs and comments → the coach reviews load/execution → the coach adjusts the next block. Coach Match adds a questionnaire, a hand-picked accredited coach, and paid packages [S2][S4][S6].
- **Pricing model.** Coach Edition from **$21.99/month** (4 Basic athlete accounts + 1 Premium athlete; extra Premium athletes $9/month; $99 start-up fee, waived with a code; 5+ Basic athletes from $54.99 base) [S2]. Human coaching via Coach Match: Bronze $149/month, Silver $229/month, Gold $359/month, with a 30-day guarantee [S6].
- **Target runner (as buyer).** Coaches, clubs and coached athletes; the athlete often does not choose the platform, the coach does.
- **Standout strengths (documented).** Real multi-athlete coach view, plan libraries, accredited-coach positioning, a marketplace with a free consultation, and a business model that pays for the coach's tooling [S2][S6].
- **Evidence-based weaknesses.** The athlete pays twice (platform + coach); quality is coach-dependent; the marketplace is high-touch and expensive; there is no AI coach in the athlete experience; the coach's admin work is the product's centre of gravity [S2][S6].
- **What POC3 can learn.** A coach view is a legitimate paid product; "human coach + software" is the premium tier runners already accept; a free consultation reduces marketplace friction [S6].
- **What not to copy.** Marketplace complexity and opaque coach pricing; coach-only value that leaves the self-coached runner with a data dashboard and no coaching voice.
- **Confidence.** High on pricing/tiers; medium on coach quality.

### 1.3 Strava (including subscription)

- **Positioning.** The social network and activity log for active people, with a subscription that adds analysis, routes, segments and AI summaries; running plans are now delivered through Runna [S9][S11][S12][S17].
- **Core workflow.** Record (phone/watch) → activity feed and segments → Training Log / Fitness & Freshness / Best Efforts → optional plan (cycling: fixed email plan; running: Runna) → Athlete Intelligence summary on the activity [S11][S12][S13][S17].
- **Pricing model.** Free tier plus subscription. Strava's own pricing page says prices are now consistent **by country** and quotes China at $7.99/month or $59.99/year, with Strava+Runna at $149.99/year [S10]. The subscribe page I fetched displayed a localized $5.00/month billed $59.99/year, plus a $12.50/month Strava+Runna bundle billed $149.99/year [S9]. Independent 2026 reviews report **$11.99/month or $79.99/year in the US** [S68]. Treat the US figure as reported, not vendor-confirmed on this date.
- **Target runner.** The broad recreational-to-serious runner who wants social comparison, segments, routes and a place where every activity already lives.
- **Standout strengths (documented).** Unmatched social graph and segments; Training Log; Fitness & Freshness; custom HR zones; pace analysis; Best Efforts (mobile only); routes/offline maps; Recover Athletics injury-prevention content [S11]. Running plans now route to Runna, which brings structured workouts and adaptation [S12][S25].
- **Evidence-based weaknesses.** Athlete Intelligence is widely described as a recap, not coaching; users explicitly ask for an AI that adjusts the week [S18]. Running plans are no longer a native Strava product; cycling plans are fixed 4-week, 5-workout email plans with no pause [S12][S13]. The social graph is also a privacy/performance pressure cooker, and API access has been contentious [S19].
- **What POC3 can learn.** Distribution and habit: the activity already lives somewhere; best-efforts presentation; mobile-first capture; the power of a weekly log.
- **What not to copy.** Social comparison as the core loop; AI that summarises but cannot act; email-based plans that are not a calendar.
- **Confidence.** High on features; medium on US price; medium on sentiment.

### 1.4 Final Surge

- **Positioning.** A free athlete training log with a paid, simpler coach platform, described by an athlete in a coach context as less complicated than TrainingPeaks [S20][S24].
- **Core workflow.** Coach builds structured workouts in a library (HR, power or pace targets) → assigns to the athlete calendar → athlete syncs Garmin and comments → coach reviews. Athletes can also self-log and follow plans [S21][S23][S24].
- **Pricing model.** Personal athlete account **free**; Coach Starter (1–5 athletes) **$19/month**; Coach Pro (up to 100 athletes) **$39/month**; yearly $190/$390; no setup fees, 14-day trial [S21][S22]. The official pricing page did not render prices to the crawler; the $19/$39 figures come from the indexed page plus third-party corroboration [S21][S22].
- **Target runner.** Cost-sensitive coaches, clubs, high-school/college programmes and their athletes; runners who want a clean log without TrainingPeaks' complexity.
- **Standout strengths (documented).** Free athlete tier, simple coach workflow, structured workouts with multiple target types, Garmin sync, per-workout comments, iOS/Android apps [S20][S21][S23].
- **Evidence-based weaknesses.** Less analytical depth than TrainingPeaks; lap times require setup or Garmin workout configuration; one coach says TrainingPeaks is easier for building workouts; pricing is not transparently machine-readable [S21][S24].
- **What POC3 can learn.** A free athlete tier plus coach-paid model is viable; simplicity beats depth for a segment of coaches; comments per workout are a cheap coaching primitive [S23][S24].
- **What not to copy.** Thin analysis; no AI layer; pricing opacity.
- **Confidence.** High on model/tiers; medium on exact price.

### 1.5 Runna

- **Positioning.** A premium personalised running-coaching app, now part of Strava, that generates a plan from a runner's goal and pushes structured workouts to a watch [S14][S19][S25].
- **Core workflow.** Onboarding questionnaire (experience, weekly volume, race distance/time, training days, long-run day) → generated plan → structured workouts to Apple Watch/Garmin/COROS/Fitbit/Suunto → move sessions or use Holiday Mode / "Not Feeling 100%" → post-run Workout Insights AI feedback [S19][S25][S26][S28].
- **Pricing model.** **$119.99/year** (displayed as $9.99/month, "save 50%") with a monthly option and a 7-day free trial; Strava+Runna bundle at $149.99/year [S25][S9]. Premium-only in practice; the first week of a plan is free but not a usable free tier [S19].
- **Target runner.** Beginner-to-intermediate runners training for a 5K–marathon who want structure and "computer says run" convenience; increasingly, Strava users who want a plan without leaving the ecosystem.
- **Standout strengths (documented/reported).** Clear structure, watch sync, in-run pace coaching, strength modules, adaptive pace updates, a polished app and very fast release cadence (five updates and two coaches announced on 12 November 2026; 20+ features in 2026) [S15][S26][S27].
- **Evidence-based weaknesses.** Reviewers repeatedly report paces that are too fast, plans that are too aggressive, and injuries [S26][S27]. "Adaptation" is perceived by some as driven by clicking "complete" rather than analysing the run [S27]. Calendar cleanup when switching plans is buggy [S27]. Strength/yoga content quality is criticised [S26]. One long-term user says service declined after the Strava acquisition [S26]. Runna's own injury statistic is observational and explicitly not causal [S15].
- **What POC3 can learn.** The onboarding-to-plan flow is the best in the set; watch push is non-negotiable for adoption; "plan is clay, not concrete" controls (Holiday Mode, move, not-feeling-100%) match how runners actually adjust [S26][S27].
- **What not to copy.** Aggressive pace prescription without a recent honest benchmark; opaque adaptation; subscription-only access; calendar operations that cannot be cleanly undone.
- **Confidence.** High on price/features; medium on outcomes; low on injury claims.

### 1.6 Garmin Coach / Daily Suggested Workouts / Garmin Connect+

- **Positioning.** Free, device-native coaching: Garmin Coach "delivers free custom plans" [S31]; Daily Suggested Workouts are personalised recommendations generated on compatible watches and Edge devices [S29]; Garmin Connect+ is an optional paid AI/insights layer [S32].
- **Core workflow.** Set a race/goal on the watch or in Garmin Connect → choose a Garmin Coach plan or follow DSW → today's workout appears on the watch → execute → training status/load/recovery update → optional Connect+ Active Intelligence summaries and performance dashboard [S29][S30][S32][S33].
- **Pricing model.** Garmin Coach and DSW are **free with compatible hardware** [S29][S31]. Garmin Connect+ is **$6.99/month or $69.99/year** with a 30-day trial [S32][S33].
- **Target runner.** Garmin owners, especially beginners and intermediate runners who want a plan on the wrist without another subscription; also experienced runners using DSW as a daily readiness check.
- **Standout strengths (documented).** Zero marginal cost, native watch execution, periodised plans, race/phase structure, adaptation to performance and recovery, and a huge installed base [S29][S30][S31].
- **Evidence-based weaknesses.** The adaptive Garmin Coach reportedly enforces a minimum of five runs/week, is overly conservative, reshuffles the week constantly and lets a poor sleep score replace hard sessions; sync bugs are reported [S35]. Connect+ Active Intelligence is one-way: no follow-up questions, no action on the plan, data locked in the Garmin app [S33][S34]. Reviewers call the insights shallow and the paywall unwelcome [S33][S34].
- **What POC3 can learn.** Zero-friction execution and trust in the device; phase-aware plans; the value of a daily readiness check; the fact that runners will accept conservative coaching if it is stable.
- **What not to copy.** Health-score overrides that silently cancel hard sessions; a fixed minimum number of run days; plan changes the runner cannot see or veto.
- **Confidence.** High on features/prices; medium on reviewer claims (self-selected r/Garmin thread).

### 1.7 Runkeeper (ASICS Runkeeper)

- **Positioning.** A long-lived, simple GPS tracker with a paid Go tier that adds training plans, deeper insights and live tracking; owned by ASICS since 2016 and developing slowly [S36][S37].
- **Core workflow.** Record a run on phone/watch → audio cues → goals/challenges → Go unlocks 5K–marathon plans, progress insights, workout comparison and live tracking → optional Strava sync [S36][S37].
- **Pricing model.** Free tier with basic tracking, audio cues and goals; **Go at $11.99/month or $39.99/year** on the official page [S36]. Third-party reviews and app-store listings report **$9.99/month** or $39.99/year, so the monthly price is inconsistent across surfaces [S37][S38].
- **Target runner.** Casual runners, beginners and ASICS loyalists who want a clean tracker and a simple plan, not a social network or a data laboratory.
- **Standout strengths (documented/reported).** Clean UI, reliable GPS, clear audio cues, plans from 5K to marathon, Apple Watch support, Strava sync [S36][S37].
- **Evidence-based weaknesses.** Most valuable features sit behind Go; ads in the free tier; development pace has slowed; smaller community; guided audio is less polished than Nike Run Club [S37]. The plan/adaptation claims are thin: the vendor page documents plans, not a real adaptive engine [S36].
- **What POC3 can learn.** Low-friction recording and audio cues; a simple plan can be enough for a large casual segment; free tier plus one paid upgrade is easy to understand.
- **What not to copy.** A stalled product with thin analytics; inconsistency between official and store pricing; no coach relationship.
- **Confidence.** High on official price; medium on review; low on the "$9.99" discrepancy.

### 1.8 Nike Run Club (NRC)

- **Positioning.** A free, brand-led running app built around audio-guided runs and 8-week training plans, from first run to marathon [S39][S40][S41].
- **Core workflow.** Pick a plan or a guided run → run with in-ear coaching and cues → log the activity → repeat; plans offer 3, 4 or 5 guided runs per week with daily guidance [S40]. No structured workout push to a watch is documented on the plan pages.
- **Pricing model.** **Free.** Nike monetises through brand and footwear, not the app [S39][S41].
- **Target runner.** Beginners and brand-affiliated runners who want motivation and voice coaching more than data; runners who will not pay a subscription.
- **Standout strengths (documented).** Free at the point of use; excellent guided-run catalogue; simple 8-week plans; motivational content and community challenges [S39][S40][S41].
- **Evidence-based weaknesses.** Plans are fixed and can feel aggressive (an 8-week plan with five runs/week is described as too much for a returning runner) [S42]. The app has no adaptive plan and is "primarily based on feel" [S27]. Crash/regression reports exist [S43]. Data depth is thin relative to Garmin/Strava/TP [S37].
- **What POC3 can learn.** Audio coaching is a retention feature, not a gimmick; free access creates reach; a plan can start from "how many days can you run?".
- **What not to copy.** Fixed plans that ignore the runner's week; no structured targets; no plan-vs-actual judgement.
- **Confidence.** High on features/free; medium on reviewer claims.

### 1.9 COROS Training Hub

- **Positioning.** A free web training platform for COROS athletes and coaches, built on EvoLab: calendar, plan/workout libraries, team management and deep metrics [S44][S45].
- **Core workflow.** COROS watch/app records → Training Hub web for analysis and planning → drag-and-drop calendar, plan library and workout library → coach/team view → EvoLab load, intensity distribution and race predictor [S44][S45]. The COROS app remains the configuration surface; Training Hub is a companion, not a replacement [S47].
- **Pricing model.** **Free** with COROS hardware; coaches apply for access and go through a tutorial with COROS's sports-science team [S44].
- **Target runner.** COROS owners, especially data-oriented runners and coaches managing teams; cost-sensitive athletes who want coach tooling without TrainingPeaks fees.
- **Standout strengths (documented).** Free coach/team layer, plan and workout builders, drag-and-drop calendar, team panel, EvoLab metrics (training load, 4-week intensity distribution, threshold pace/HR, race predictor), strength plans in the public library [S44][S45][S48].
- **Evidence-based weaknesses.** Users report CRUD gaps: cannot add gear, change activity type, add manual activity or adjust settings in the Hub; FIT import errors; the web app is a companion, not a full replacement [S47]. No native conversational coach; AI plan-writing is only via an external MCP assistant [S46].
- **What POC3 can learn.** A free coach/team layer is a credible wedge; plan and workout libraries are expected; device-native metrics can be exposed without a subscription.
- **What not to copy.** Splitting configuration and planning across two surfaces; incomplete CRUD; assuming the runner will use the web Hub on a phone.
- **Confidence.** High on features; medium on criticism.

### 1.10 Intervals.icu

- **Positioning.** A free, community-built training platform for cyclists, runners and triathletes: powerful analytics, structured training and a drag-and-drop calendar, with a $4/month supporter tier [S49][S50].
- **Core workflow.** Sync activities from Garmin/Strava/1200+ sources → fitness/fatigue/form chart → drag-and-drop calendar and workout builder → plan editor for multiple athletes → custom zones and interval detection → optional MCP connector for the runner's own AI [S49][S50][S52].
- **Pricing model.** **Free** for the core platform; **$4/month** supporter tier unlocks the MCP connector, advanced weather, annual training-plan builder, full Strava history import, teams/coaching organisations and custom zones [S49].
- **Target runner.** Data-literate runners/cyclists/triathletes, coaches and power users who want control and do not need a mobile app.
- **Standout strengths (documented).** Enormous depth for free; drag-and-drop calendar; workout builder with ZWO/FIT/MRC/ERG import/export; plan editor; custom zones; 1200+ integrations; MCP for external AI [S49][S50][S52].
- **Evidence-based weaknesses.** No official mobile app; the web UI on a phone is described as "not very slick and smooth", with calendar navigation and small-screen friction; third-party companion apps fill the gap [S51]. Steep learning curve; no guided onboarding; no native conversational coach [S49][S51].
- **What POC3 can learn.** Free depth is a competitive weapon; a plan editor and workout builder are table stakes for power users; an MCP/open-data posture can attract the AI-curious.
- **What not to copy.** Web-only UX for a phone-first activity; chart overload without a narrative; assuming the runner wants to learn the model.
- **Confidence.** High on features/prices; medium on mobile UX.

### 1.11 Athletica AI

- **Positioning.** Adaptive endurance training plans plus a conversational AI Coach that explains and analyses, but explicitly **does not modify** the plan [S53][S54].
- **Core workflow.** Baseline test → adaptive plan (running, triathlon, cycling, HYROX, rowing, duathlon) → workouts sync to Garmin/Strava/COROS/Wahoo/Concept2 → AI Coach chat answers questions and explains data → Workout Wizard lets the runner adjust sessions [S53][S54].
- **Pricing model.** **$19.90/month**, **$99/6 months**, **$189/year**, with a 2-week free trial and no credit card required [S54].
- **Target runner.** Self-coached endurance athletes, especially triathletes, who want science-based adaptive plans and a conversational explanation layer without a human coach.
- **Standout strengths (documented).** Adaptive plan, conversational AI Coach, personalised zones from a baseline test, multi-sport coverage, broad device sync, Workout Wizard [S53][S54].
- **Evidence-based weaknesses.** A detailed forum review reports injury-driven threshold recalculation that made zones useless, race predictions 21–30 minutes off, unnecessarily heavy peak volume, no long runs or marathon-pace runs in a marathon block, and "black box" metrics; the company replied that race prediction is not a feature and the approach is conservative [S55]. The AI Coach cannot change the plan, so the runner must still do the work of replanning [S54].
- **What POC3 can learn.** A conversational explanation layer is valued; Workout Wizard-style manual adjustment is a good compromise when the AI cannot write; adaptive zones need an injury-safe path.
- **What not to copy.** Black-box metrics; race predictions presented as reliable; AI that can explain but not act; volume prescriptions that ignore the runner's life.
- **Confidence.** High on features/prices; low–medium on outcomes (single detailed forum review).

### 1.12 Humango (HumanGO)

- **Positioning.** An AI training planner for time-crunched endurance athletes, coaches and teams, built around "Hugo", a multilingual AI coach, and flexible plans that adapt to schedule, fatigue and injury [S56][S57].
- **Core workflow.** 20-minute onboarding → connect devices → set one or more goals → Hugo builds a plan → the plan adapts to availability, physiological progress, health metrics and feedback → chat/feedback → optional 1-day/2-day recalibration tests and race planner [S57].
- **Pricing model.** **Essential $16.99/month**; **Premium $28.99/month** (multi-sport goals, recalibration tests, race planner); 14-day free trial [S57].
- **Target runner.** Busy endurance athletes (often triathletes) who value flexibility over data depth; coaches/teams wanting an AI planning layer.
- **Standout strengths (documented/reported).** Flexible moving of workouts, Garmin sync, injury/sport-removal adjustments, multi-sport goals, race planner, recalibration tests [S57][S58].
- **Evidence-based weaknesses.** Reviewers describe the AI as underwhelming and "gimmicky"; analysis is limited beyond basic summaries; thresholds can be too easy; plans can undertrain; Hugo is not conversational enough; €20/month is judged not justified yet [S58][S59]. The vendor's "hyper-personalized" language is stronger than the reported experience [S56][S58].
- **What POC3 can learn.** Injury/sport removal that reflows the calendar is a strong pattern; schedule-first adaptation matches real life; recalibration tests are a useful trust device.
- **What not to copy.** Chat that overpromises; shallow analysis dressed as AI; adaptation that is not visible or explainable.
- **Confidence.** High on price/features; medium on outcomes.

---

## 2. Feature matrix

### 2.1 Legend

| Symbol | Meaning |
|---|---|
| **●** | Native, documented capability that is part of the product's core workflow |
| **◐** | Partial/limited: works only in some modes, plans, devices or regions; or the vendor documents a weaker version |
| **◇** | Third-party/connector: capability exists only through an external assistant, MCP, API or integration |
| **○** | Absent: not documented and no credible report of it |
| **?** | Unknown/not verified: contradictory, inaccessible or simply not documented |
| **n/a** | Not applicable to a private PoC with no commercial packaging |

Column key: **POC3** = this product; **TP** = TrainingPeaks athlete; **TPC** = TrainingPeaks Coach Edition; **STR** = Strava; **FS** = Final Surge; **RUN** = Runna; **GAR** = Garmin Coach/DSW/Connect+; **RK** = Runkeeper; **NRC** = Nike Run Club; **COR** = COROS Training Hub; **INT** = Intervals.icu; **ATH** = Athletica AI; **HUM** = Humango.

### 2.2 Matrix (as of 2026-11-18)

| Capability | POC3 | TP | TPC | STR | FS | RUN | GAR | RK | NRC | COR | INT | ATH | HUM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Month/week calendar planning | ● month; week only in log¹ | ● | ● | ◐² | ● | ● | ● | ◐ | ◐ | ● | ● | ● | ● |
| Plan templates / plan library | ○³ | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Adaptive / dynamic plan | ◐⁴ | ◐ | ◐ | ○⁵ | ◐ | ● | ● | ? | ○ | ◐ | ◐ | ● | ● |
| AI chat coach | ● | ?⁶ | ○⁷ | ◐⁸ | ? | ◐⁹ | ◐¹⁰ | ○ | ○ | ◇¹¹ | ◇¹² | ●¹³ | ●¹⁴ |
| Natural-language calendar edits | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ◇¹⁵ | ◇¹⁶ | ○¹⁷ | ◐¹⁸ |
| Executed-workout import | ● Garmin only | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Planned workouts on device / import from device | ○¹⁹ | ● | ● | ◐²⁰ | ● | ● | ● | ◐ | ◐ | ● | ● | ● | ● |
| Per-km splits | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Laps / intervals | ● | ● | ● | ● | ● | ● | ● | ◐ | ◐ | ● | ● | ● | ● |
| HR zones | ◐²¹ | ● | ● | ● | ● | ◐²² | ● | ◐ | ◐ | ● | ● | ● | ● |
| Training load / ACWR | ●²³ | ● | ● | ◐²⁴ | ? | ○²⁵ | ● | ? | ? | ● | ● | ● | ● |
| Hard/easy or polarized view | ●²⁶ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ○ | ◐ | ● | ● | ● | ◐ |
| PRs / best efforts | ◐²⁷ | ● | ● | ●²⁸ | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Week/month/year log | ● | ● | ● | ● | ● | ◐ | ● | ● | ● | ● | ● | ● | ● |
| Reminders / notifications | ◐²⁹ | ◐ | ◐ | ◐ | ◐ | ● | ● | ◐ | ● | ◐ | ◐ | ◐ | ◐ |
| Mobile app | ○³⁰ | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○³¹ | ● | ● |
| Offline / PWA | ○³² | ◐ | ◐ | ● | ◐ | ● | ● | ● | ● | ● | ◐³³ | ◐ | ◐ |
| Wearable sync breadth | ○³⁴ | ● | ● | ● | ● | ● | ●³⁵ | ◐ | ◐ | ●³⁶ | ● | ● | ● |
| Strength / cross-training | ○³⁷ | ● | ● | ◐³⁸ | ● | ●³⁹ | ● | ◐ | ◐ | ● | ● | ●⁴⁰ | ● |
| Injury / recovery guardrails | ●⁴¹ | ◐ | ●⁴² | ◐⁴³ | ◐ | ◐⁴⁴ | ◐⁴⁵ | ○ | ○ | ◐ | ○ | ◐⁴⁶ | ●⁴⁷ |
| Race-day guidance | ◐⁴⁸ | ◐ | ● | ◐ | ◐ | ● | ● | ◐ | ● | ● | ◐ | ● | ● |
| Community / social | ○ | ◐ | ◐ | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ● | ● | ◐ | ◐ |
| Human-coach marketplace | ○⁴⁹ | ● | ● | ○ | ● | ◐ | ○ | ○ | ○ | ◐ | ◐ | ◐ | ◐ |
| Data export | ○⁵⁰ | ● | ● | ● | ● | ◐ | ● | ● | ◐ | ● | ● | ● | ◐ |
| Multi-user / coach view | ◐⁵¹ | ● | ● | ○ | ● | ○ | ○ | ○ | ○ | ● | ● | ◐ | ● |
| Pricing (2026-11-18) | n/a⁵² | Free; $19.95/mo or $134.99/yr | From $21.99/mo + $99 start-up | Free; ~$11.99/mo or $79.99/yr US⁵³ | Free athlete; coach $19/$39/mo | $119.99/yr | Free with device; Connect+ $6.99/mo or $69.99/yr | Free; Go $11.99/mo or $39.99/yr⁵⁴ | Free | Free with device | Free; $4/mo supporter | $19.90/mo; $99/6mo; $189/yr | $16.99/mo; $28.99/mo |

### 2.3 Matrix footnotes (uncertainty register)

1. POC3's Plan calendar is month-only; the Week view exists in the Training log, not as an editable plan view (`FEATURES-FOR-REVIEW.md`, A5).
2. Strava's running plans moved to Runna; native cycling plans are fixed 4-week, 5-workout email plans with no editable calendar [S12][S13].
3. POC3 plan templates are explicitly open (`FEATURES-FOR-REVIEW.md`, B7); the coach can invent a plan but cannot start from a named template.
4. POC3 replans on request through the LLM, and the coaching-state engine detects race/load/consistency; there is no automatic weekly adaptation or deterministic plan generator.
5. Strava's native plans are fixed; adaptation exists only through the Runna bundle [S12][S25].
6. TrainingPeaks' public materials emphasise plans, the coach directory and Coach Match; I found no documented native conversational coach in the athlete guide [S1][S4][S6]. Marked `?`, not `○`.
7. TrainingPeaks Coach Edition is a human-coach workflow; no AI chat is documented [S2][S4].
8. Strava Athlete Intelligence is a generated summary on the activity, not a chat; it is subscriber-only, mobile-only, and can be hidden [S17]. It now also connects read-only to Gemini/Claude [S16].
9. Runna's AI is "Workout Insights": post-run personalised feedback, not a chat that edits the plan [S28].
10. Garmin Connect+ Active Intelligence is one-way: personalised insights/suggestions, no follow-up questions, no plan edits [S32][S33][S34].
11. COROS AI is an external MCP connection (ChatGPT/Claude/Cursor): can create/edit plans and workouts, 4–16 weeks, start date within 14 days, no delete via AI [S46].
12. Intervals.icu offers an MCP connector for the runner's own AI assistant on the $4/month supporter tier [S49].
13. Athletica's AI Coach is conversational but explicitly does not modify the plan, settings or completed workouts [S54].
14. Humango's Hugo is a chat/coaching layer; reviewers describe it as limited and not meaningfully "smart" [S57][S58][S59].
15. COROS: external AI can add/edit plans and workouts, cannot delete, and the start date is limited to today +14 days [S46].
16. Intervals.icu: external AI via MCP; no native natural-language calendar editing documented [S49].
17. Athletica: "The AI Coach does not automatically modify your training, settings, or completed workouts" [S54].
18. Humango: reviewers say Hugo can schedule trainings but is "not smart in any meaningful way" [S58].
19. POC3 cannot read future scheduled Garmin workouts, Garmin Coach plans or the Garmin calendar; a Personal API key exposes the executed workout, not the future plan (`README.md`; `docs/GARMIN-TRAINING-PROGRAMS.md`).
20. Strava plans arrive by email; there is no structured workout push to a watch in the native cycling plan documentation [S13].
21. POC3 stores HR-zone time but no zone boundaries (`README.md`, "Splits and zones" limit).
22. Runna's plan pages do not document HR-zone targets; a reviewer says it does not incorporate HR/elevation/power [S19].
23. POC3 uses Garmin's proprietary training load plus a soft coupled 7/28-day ACWR; it is a signal, not a diagnosis (`README.md`).
24. Strava documents Relative Effort and Fitness & Freshness, not ACWR [S11].
25. Runna does not document a load/ACWR model; a reviewer says it ignores HR, elevation and power [S19].
26. POC3's Training log week view shows weekly load, ACWR and a hard/easy split (`README.md`).
27. POC3 PR badges and period best efforts are bests within stored history (90 days / 100 activities), not lifetime records (`README.md`).
28. Strava Best Efforts is mobile-only [S11].
29. POC3's notification bell is the Garmin sync feed; there are no per-session workout reminders (`FEATURES-FOR-REVIEW.md`, A7).
30. POC3 is web-only; no mobile app or installable PWA (`FEATURES-FOR-REVIEW.md`, A10).
31. Intervals.icu has no official mobile app; a forum moderator says "There are no official app" and lists third-party companions [S51].
32. POC3 has no service worker/offline shell (`FEATURES-FOR-REVIEW.md`, A10).
33. Intervals.icu can be used as a PWA on Android per a forum user, but there is no first-party offline app [S51].
34. POC3 syncs Garmin only, through a per-runner Personal API key (`README.md`).
35. Garmin syncs Garmin devices; that is broad within the Garmin ecosystem but not cross-brand.
36. COROS syncs COROS devices; Training Hub is COROS-only [S44][S45].
37. POC3 has no strength or cross-training logging (`FEATURES-FOR-REVIEW.md`, no strength item).
38. Strava records strength activities and offers Recover Athletics content, but no structured strength plan [S11].
39. Runna includes strength modules; reviewers criticise their quality and gym-equipment assumptions [S26][S27].
40. Athletica generates a limited set of stability/mobility and upper/lower-body exercises per the forum review [S55].
41. POC3's state engine has `pain_injury`, `illness`, `return_to_run`, `medical_red_flag` and other guardrails; sensitive states require confirmation and the gateway blocks writes accordingly (`docs/COACH-STATES.md`).
42. TrainingPeaks Coach Edition's guardrail is the human coach, not software enforcement [S2][S4].
43. Strava offers Recover Athletics injury-prevention exercises but no plan-level guardrail [S11].
44. Runna markets injury prevention and reports an observational injury rate; reviewers report injuries from aggressive plans [S15][S26][S27].
45. Garmin DSW reduces/changes sessions based on sleep/recovery; reviewers experience this as a guardrail that overrides hard work [S35].
46. Athletica is conservative by design per its staff reply, but the forum review reports a post-injury threshold recalculation problem [S55].
47. Humango lets a runner log an injury or remove a sport temporarily and adjusts the schedule; a reviewer used this for sciatica and found it better than TrainingPeaks [S58].
48. POC3 has race day/week, taper and post-race states and guardrails, but no race countdown card, pacing plan or race-day logistics (`FEATURES-FOR-REVIEW.md`, B4).
49. Human-coach marketplace is an explicit POC3 non-goal (`FEATURES-FOR-REVIEW.md`, §5).
50. POC3 has no export endpoint; SQLite backup/export is a P0 candidate, not implemented (`FEATURES-FOR-REVIEW.md`, C7).
51. POC3 has multi-user accounts with per-user isolation, but no coach view or shared athlete dashboard (`README.md`; `FEATURES-FOR-REVIEW.md`).
52. POC3 is a private PoC; payments are a non-goal (`README.md`).
53. Strava price is localized by country; the US figure is from independent 2026 reviews, not confirmed on Strava's own page in this session [S9][S10][S68].
54. Runkeeper's official page says $11.99/month; third-party listings say $9.99/month; annual $39.99 is consistent [S36][S37][S38].

### 2.4 How to use the matrix

- **Read rows, not totals.** A product can be ● on 20 rows and still lose the runner because it fails the two rows that matter to that runner (e.g., a phone-first beginner cares about mobile, reminders and plan clarity, not laps).
- **`●` is not "good".** It means "native and documented". Garmin's ● on adaptive plans is exactly the feature reviewers criticise [S35].
- **`○` is a product decision, not a bug.** POC3's ○ on social, coach marketplace and pricing are deliberate non-goals; the question is whether they are liabilities (§8).
- **`?` must be resolved before a build decision.** The highest-value unknowns are TrainingPeaks' native AI chat, Final Surge's load model, and Runkeeper/NRC's load models.

### 2.5 POC3's row-level verdict

| Verdict | Rows | What it means |
|---|---|---|
| **Differentiated (no direct competitor documents the same combination)** | Natural-language calendar edits; auditable AI change sets/undo; executed-workout overlay paired with the planned session; private calendar-first coach with consent-based state guardrails | The wedge. Must be protected and made legible to the runner; "differentiated" is not the same as "unmatched" on each row. |
| **Parity** | Executed-workout import (Garmin), per-km splits, laps/intervals, week/month/year log, hard/easy view, race states | Enough to be credible; not enough to win. |
| **Behind** | Mobile, offline/PWA, reminders, plan templates, export, wearable breadth, strength, community, coach view, race-day logistics, onboarding, pricing/business model, automatic adaptation | Table stakes POC3 must close or explicitly price/position around. |
| **Unknown** | HR-zone boundaries, lifetime PRs, load model transparency vs Garmin | Low urgency; affects trust more than acquisition. |

---

## 3. Workflow comparison: create, adjust, review, race

The same four jobs look different in each family. The point is not to score features but to locate friction: where does the runner have to translate intent into clicks, wait for a coach, or accept a plan change they did not ask for?

### 3.1 Device-first family (Garmin Coach/DSW, COROS Training Hub; NRC and Runkeeper as phone-first cousins)

**Create a plan.** The runner sets a goal on the watch or in the vendor app, chooses a Garmin Coach plan or follows DSW; COROS users can build or copy a plan in Training Hub on the web [S29][S30][S45]. The plan is born inside the vendor's world; there is no import of an outside PDF or spreadsheet in the documented flow.

**Adjust a week.** On Garmin, the plan can reshuffle itself based on sleep/recovery, which reviewers experience as the plan moving under them [S35]. On COROS, the runner or coach drags sessions in the web calendar [S45]. Neither offers natural-language editing. The runner's real week (a work trip, a sick child) is accommodated by moving one session at a time, if at all.

**Review a run.** Garmin Connect shows the activity, training status/load and (with Connect+) AI summaries and a performance dashboard [S32][S33]. COROS shows EvoLab metrics: training load, 4-week intensity distribution, threshold pace/HR, race predictor [S45]. The review is metric-first; the "did this session do what the plan intended?" judgement is left to the runner or coach.

**Prepare for a race.** Garmin's race widget/DSW and phase-aware plans are the strongest device-native race flow [S30][S35]; COROS exposes a race predictor [S45]. Race-day logistics, pacing and contingency are not part of the calendar.

**Friction.** Device lock-in; plan changes that are invisible or unexplained; a minimum number of run days in the adaptive Garmin Coach (reviewer-reported); a split between watch, phone app and web hub; no natural-language control; no plan provenance.

**POC3 relative.** POC3 reads the *executed* Garmin workout and pairs it with the run, which is better than Garmin's own "which workout did I follow?" story in POC3's UI. But POC3 cannot read the *future* Garmin plan, so it cannot replace the device-first flow for a Garmin Coach user; it can only sit beside it.

### 3.2 Coach-platform family (TrainingPeaks, TrainingPeaks Coach Edition, Final Surge)

**Create a plan.** The coach builds a plan in a calendar, often from a workout library or an annual training plan, and assigns it to the athlete [S4][S8][S23]. The athlete may also buy a plan or self-build. The calendar is the system of record and structured workouts sync to the device [S1][S21].

**Adjust a week.** The athlete comments, the coach edits, or the athlete moves sessions. TrainingPeaks users say the ability to move/bump workouts should not be premium-gated [S7]. Final Surge users describe a simpler move/edit experience than TrainingPeaks [S24]. The adjustment is a human negotiation, not a model turn.

**Review a run.** TrainingPeaks shows TSS/CTL/ATL/TSB, Peak Performances, comments and coach feedback [S1][S4][S5]. Final Surge shows the activity, comments and basic stats [S20][S24]. The coach interprets; the software does not.

**Prepare for a race.** The coach builds race week and the taper into the calendar; TrainingPeaks' ATP gives the season shape [S8]. Coach Match adds a paid human relationship with a free consultation and monthly packages [S6].

**Friction.** Cost (platform plus coach); coach availability and quality; complexity; premium gating of basic schedule edits; no AI conversation; the athlete is dependent on a human to re-flow the week.

**POC3 relative.** POC3 has no coach view, which is a deliberate non-goal (`FEATURES-FOR-REVIEW.md`, §5). That means POC3 cannot serve the coach-platform buyer. It could, however, serve the *self-coached* runner who wants the coach-platform rigour without the coach, and later export a clean plan to a human coach.

### 3.3 AI-plan app family (Runna, Athletica AI, Humango)

**Create a plan.** Onboarding questionnaire → generated plan. Runna asks for experience, weekly volume, race distance/time, training days and long-run day [S19][S25]. Athletica runs a baseline test and builds zones [S54]. Humango takes about 20 minutes to set a goal and connect devices [S57]. This is the best onboarding-to-plan flow in the benchmark.

**Adjust a week.** Runna offers move, Holiday Mode and "Not Feeling 100%" [S15][S26]; Athletica offers a Workout Wizard but the AI Coach explicitly does not modify the plan [S54]; Humango adapts to availability, fatigue and injury/sport removal [S57][S58]. None lets the runner say "move my Thursday tempo to Saturday and shorten it" and have the calendar update with a visible before/after.

**Review a run.** Runna gives post-run Workout Insights (AI feedback) [S28]; Athletica gives a conversational AI Coach that explains data [S53]; Humango gives Hugo feedback [S56]. The review is read-only: it can explain, but it cannot act on the next week.

**Prepare for a race.** The plan tapers; Runna adds race-day guidance and pacing [S25]; Athletica shows race predictions (criticised as unreliable) [S55]; Humango's Premium adds a Race Planner [S57]. Race week is part of the plan, not a separate command surface.

**Friction.** Opaque adaptation; aggressive paces; no provenance for the plan; calendar bugs when switching plans; subscription-only access; AI that explains but cannot change the calendar.

**POC3 relative.** POC3 is the inverse: weak onboarding and no templates, strong natural-language calendar control and guardrails. The opportunity is to combine Runna's intake with POC3's editing model, not to out-generate Runna.

### 3.4 Social-logging family (Strava, Nike Run Club, Runkeeper)

**Create a plan.** The plan is a bolt-on. Strava's native cycling plans are fixed 4-week, 5-workout email plans [S13]; running plans now route to Runna [S12]. Nike offers fixed plans (e.g., an 8-week 5K) with 3–5 guided runs per week [S39][S40]. Runkeeper Go offers 5K–marathon plans behind the subscription [S36]. None treats the plan as an editable calendar that is the product.

**Adjust a week.** Manual: skip, rearrange, or restart. Strava's cycling plan help explicitly says there is no pause and the runner can rearrange days [S13]. NRC plans do not adapt [S27]. Runkeeper's plan adaptation is not documented beyond "plans" [S36].

**Review a run.** Strava: segments, Training Log, Fitness & Freshness, Best Efforts, AI summary [S11][S17]. NRC: guided run recap and challenges [S39]. Runkeeper: pace/elevation/splits and audio cues [S36][S37]. The review is comparative/social, not plan-vs-actual.

**Prepare for a race.** Strava/NRC/Runkeeper offer plans and community motivation, not race-week execution tools [S11][S39][S36]. The race is a social event, not a calendar state.

**Friction.** The plan is not the system of record; AI summaries are not actionable; social comparison can motivate or demotivate; no natural-language edits; no guardrails.

**POC3 relative.** POC3 is deliberately private and has no social graph. That is a legitimate niche but not parity: the social-logging family owns the runner's activity feed and identity, and POC3 cannot replace it without Strava.

### 3.5 POC3 reference workflow (for contrast)

**Create.** The runner opens the coach bubble and asks for a block ("half marathon in 12 weeks, four days, long run Sunday"); the model proposes a `propose_calendar_turn`, the gateway validates it, and the month grid updates in place with animated pills [POC3 README]. There is no questionnaire, no template, and no deterministic fallback if the model fails.

**Adjust.** "Move Thursday's tempo to Saturday, shorten it to 6 km" is a chat turn; the coach can add/move/delete/revert, and the gateway enforces write permission. There is no diff preview before apply (A3 open), no streaming (A4 open), and no drag-and-drop (A6 open) [POC3 backlog].

**Review.** The run peek shows metrics, plan match, load/effect, fastest efforts and PR badges; the activity detail shows splits, laps, HR zones and the Garmin workout the run followed; the training log shows week/month/year with load/ACWR and a metric trend [POC3 README]. This is a stronger *plan-vs-actual* story than any AI-plan app in this benchmark.

**Race.** Race day/week, taper and post-race are detected as coaching states and enforced by guardrails; sensitive states (pain, illness) require confirmation [POC3 COACH-STATES]. There is no race countdown card, pacing plan or race-day logistics (B4 open).

**Friction.** No mobile app, no reminders, no templates, no export, no diff preview, no streaming, no fallback planner, no coach view, no strength, no social. These are not small; they are the difference between a compelling demo and a product a runner can live with.

### 3.6 Steps-and-friction comparison

| Family | Create a plan | Adjust a week | Review a run | Prepare for a race | Main friction | POC3 relative |
|---|---|---|---|---|---|---|
| **Device-first** (Garmin, COROS) | Watch/app onboarding; Garmin Coach/DSW; COROS web plan builder [S29][S30][S45] | Move on watch/app; Garmin may auto-reshuffle; COROS drag-drop web [S35][S45] | Watch metrics; Connect/Connect+ or EvoLab [S32][S45] | Race widget/DSW; race predictor [S30][S45] | Opaque changes; minimum days; device lock-in; split surfaces | Reads executed workout, not future plan; calendar is editable |
| **Coach-platform** (TP, TPC, FS) | Coach builds calendar/library; ATP or plan purchase [S4][S8][S23] | Coach edits; athlete messages; premium gates basic move [S7] | TSS/CTL/ATL + comments; coach interprets [S1][S5] | Coach-built race week/taper [S8][S6] | Cost; coach dependence; complexity | No coach view; opportunity for handoff/export |
| **AI-plan app** (Runna, Athletica, Humango) | Questionnaire → generated plan; baseline test [S19][S25][S54] | Move/Holiday/Not 100%; Workout Wizard; injury removal [S15][S54][S58] | Post-run AI insights or AI chat [S28][S53] | Taper; race planner/predictor [S25][S55][S57] | Opaque adaptation; aggressive paces; calendar bugs; read-only AI | Wins on NL writes/undo; loses on onboarding/templates |
| **Social-logging** (Strava, NRC, Runkeeper) | Bolt-on plans: email/fixed/app plans [S12][S13][S39][S36] | Manual skip/rearrange/restart [S13] | Segments, best efforts, AI summary [S11][S17] | Plans + community, not execution tools [S11][S39] | Plan not system of record; AI not actionable; social pressure | Private calendar; no social graph |
| **POC3 (reference)** | Chat + batch add; validated; no template [POC3 README] | Chat move/delete/revert; no diff preview [POC3 backlog] | Peek/detail/log + Garmin workout [POC3 README] | States/taper guardrails; no countdown/pacing [POC3 COACH-STATES] | No mobile/reminders/diff/streaming/fallback | — |

---

## 4. What runners praise and criticise, by product

This table is deliberately separate from §1–2. §1–2 report what is documented; this section reports what users say. Sources are self-selected; a complaint is evidence that a failure mode exists, not evidence of how common it is.

| Product | What runners praise (source) | What runners criticise (source) | Evidence quality / caveat |
|---|---|---|---|
| **TrainingPeaks** | Analytics/dashboard depth; coach workflow; "geek out on stats" is the reason to pay [S7] | Premium gates moving/bumping workouts; complexity; running TSS can be confusing; Intervals.icu gives more for free [S5][S7] | Small subreddit thread; vendor help page confirms TSS complexity [S5] |
| **TrainingPeaks Coach Edition** | Accredited coaches; free consultation; structured packages; 30-day guarantee [S6] | $149–$359/month; quality is coach-dependent; athlete pays platform + coach [S2][S6] | Vendor pricing page + marketplace copy; no independent coach-quality data |
| **Strava** | Social graph, segments, Training Log, routes, best efforts; "most of the app is free" [S11][S18] | Athlete Intelligence is a recap, not coaching; users want an AI that adjusts the plan; running plans moved to Runna; price rises [S12][S18] | Large threads, strong opinions; vendor support confirms AI limits [S17] |
| **Final Surge** | Simpler than TrainingPeaks; Garmin sync; per-workout comments; good for coached athletes [S24] | Lap times need setup; one coach finds TP easier for workout building; pricing not transparently rendered [S21][S24] | Two small threads; one coach perspective; price from index/third party |
| **Runna** | Structure, watch sync, "computer says run" convenience, strength modules, responsive support [S26][S27] | Paces too fast; plans too aggressive; "adaptation" feels click-based; calendar cleanup bugs; strength/yoga quality; post-acquisition decline [S26][S27] | Fan subreddit + marathon subreddit; both contain balanced praise and criticism |
| **Garmin Coach / DSW** | Free plans, watch integration, periodisation, race/phase structure, "Amy's plan" quality [S30][S31][S35] | Minimum five runs/week; too conservative; constant reshuffling; sleep score cancels hard sessions; sync bugs [S35] | One detailed r/Garmin post with 81 comments; commenters disagree on cause |
| **Garmin Connect+** | Daily AI nudge, performance dashboard, extra coaching videos [S32][S33] | AI talks at the runner, no follow-up; insights shallow; data locked in Garmin; paywall unwelcome [S33][S34] | Expert hands-on + independent review; both early-2025/2026 |
| **Runkeeper** | Clean UI, reliable GPS, audio cues, simple plans, Apple Watch [S37] | Paywall, ads, slow development, smaller community, less polished than NRC [S37] | Single independent review; affiliate site; price inconsistency across surfaces [S36][S38] |
| **Nike Run Club** | Free; excellent guided audio; simple plans; motivational content [S39][S40][S41] | 8-week/five-runs-a-week plan feels aggressive; crashes; no adaptation; "primarily based on feel" [S42][S43][S27] | Small threads; one direct plan complaint; crash reports are recent but anecdotal |
| **COROS Training Hub** | Free; strong plan/workout builder; teams; EvoLab metrics; desktop planning [S44][S45][S47] | CRUD gaps (gear, manual activity, activity type); FIT import errors; web-only companion; phone app still needed [S47] | One critical thread; other commenters defend the Hub's planning strength |
| **Intervals.icu** | Free depth; calendar; custom zones; community; "more usable data than any other platform" [S49] | No official mobile app; mobile web UX; learning curve [S51] | Forum thread is power-user biased; vendor site confirms no app |
| **Athletica AI** | Adaptive plan; conversational AI feedback; user-friendly interface; "feels like a support system" [S55] | Injury-driven threshold recalculation; race prediction 21–30 min off; heavy volume; no long/MP runs; black-box metrics [S55] | One long, detailed forum review answered by staff; not representative |
| **Humango** | Flexible moving; Garmin sync; injury/sport removal; structure and accountability [S58][S59] | AI underwhelming/gimmicky; limited analysis; undertraining; thresholds too easy; price not justified [S58][S59] | Two r/triathlon threads; small samples; one positive, one negative |

**What this table does not prove.** It does not show prevalence, willingness to pay, or whether a complaint is fixed in the current release. It shows the *failure modes* a product must design against. The strongest repeated themes across products are: (a) plans that move without explanation, (b) paces/volumes that ignore the runner's real week, (c) AI that summarises rather than acts, and (d) calendar/sync bugs that make the plan disagree with reality.

---

## 5. Positioning map

The axes are chosen for POC3's decisions, not for a generic market map: structure vs flexibility (how much the product prescribes vs how easily the runner can change it), data depth vs simplicity (how much the runner must know), and automation vs runner control (who decides when the plan changes).

### 5.1 Structure vs flexibility

| | **Low flexibility** (hard to change the plan) | **High flexibility** (easy to change the plan) |
|---|---|---|
| **High structure** (prescribed sessions) | Garmin Coach/DSW, Nike plans, Strava cycling plans, TrainingPeaks templates | **POC3**, Runna, Athletica, Humango, COROS, TrainingPeaks with a coach |
| **Low structure** (no prescribed block) | Paper/PDF plan alone | Strava log, Runkeeper free, Google Calendar/Sheets, Intervals.icu self-coached |

- **POC3** sits in high structure / high flexibility *in its edit primitives*: the coach can add/move/delete/revert a whole week in one turn. But its *view flexibility* is low: month-only plan view, no week/agenda, no drag-and-drop, no templates. Honest placement: **high structure, medium-high flexibility, low view flexibility**.
- **Runna** is high structure, medium flexibility: move/Holiday/Not-100% exist, but reviewers report calendar bugs and paces that are hard to override [S26][S27].
- **Athletica** is high structure, high flexibility on paper (Workout Wizard) but the AI Coach cannot modify the plan [S54]; flexibility is manual.
- **Humango** is medium structure, high flexibility: plans adapt and can be moved, but reviewers say the analysis and challenge are thin [S58][S59].
- **Garmin** is high structure, low flexibility: the plan can change itself, but the runner cannot easily veto or re-flow it [S35].
- **TrainingPeaks** is high structure, medium flexibility: the calendar is editable, but basic moves are premium-gated and the coach is the usual editor [S7].

### 5.2 Data depth vs simplicity

| | **Low simplicity** (steep learning curve) | **High simplicity** (usable on day one) |
|---|---|---|
| **High depth** (load, zones, splits, trends) | TrainingPeaks, Intervals.icu, COROS Training Hub | Garmin Connect/Connect+, **POC3 (if mobile/PWA solved)**, Strava |
| **Low depth** | — | Nike Run Club, Runkeeper, Google Calendar/Sheets |

- **POC3** has high depth (load/ACWR, splits, laps, HR zones, PRs, metric trend, Garmin workout overlay) but low simplicity today: dense web UI, no mobile, no onboarding, no templates. It is the only product in the "high depth" row that is also trying to be a conversation, which is the opening.
- **Garmin** is the closest to high depth + high simplicity because the watch is the interface and the phone app is the dashboard [S32][S33].
- **Strava** is medium depth + high simplicity; it deliberately stops at summaries and segments [S11][S17].
- **Nike/Runkeeper** are low depth + high simplicity; they win casual runners on friction, not insight [S39][S37].
- **TrainingPeaks/Intervals/COROS** are high depth + low simplicity; their users tolerate the learning curve because they are power users or coached [S1][S49][S45].

### 5.3 Automation vs runner control

| | **Low runner control** (the system decides) | **High runner control** (the runner decides) |
|---|---|---|
| **High automation** | Garmin DSW, Runna | Athletica (suggests, never writes), **POC3** (proposes, validates, undo), Humango (adapts, movable) |
| **Low automation** | Paper/PDF plan | TrainingPeaks self-coached, Intervals.icu, Google Calendar/Sheets |

- **POC3** is medium automation + high control: the coach acts only on a turn, the gateway validates before writing, and undo is available. That is a genuinely different position from both Garmin (automation overrides) and Athletica (no writes).
- **Garmin** is high automation + low control: sleep/recovery can replace a hard session; the runner sees it after the fact [S35].
- **Runna** is high automation + medium control: the runner can move sessions, but the plan's pace/volume logic is not transparent [S26][S27].
- **Athletica** is high automation + high control *because it refuses to write*; that is control by abstention, not by design [S54].
- **TrainingPeaks/Intervals** are low automation + high control: the runner or coach does the work [S4][S49].

### 5.4 Where POC3 is alone, at parity, or behind

| Status | Area | Evidence | Implication |
|---|---|---|---|
| **Differentiated** | Natural-language calendar edits with server validation, undo and an audit trail | No competitor documents native NL calendar editing; COROS only via external MCP with limits [S46]; Athletica explicitly refuses [S54] | The wedge. Protect it; make it legible; add diff preview and a user-facing history. |
| **Differentiated (presentation)** | Executed-workout overlay paired with the planned session (run + Garmin workout in one pill) | POC3 pairs the recorded run with the workout it followed; competitors show the activity and the plan separately [POC3 README; S11][S45] | A concrete "did I do the session?" answer; extend to coach-authored sessions, not only Garmin. |
| **Differentiated (consent semantics)** | Private calendar-first coach with hard state guardrails and sensitive-state consent | Garmin overrides via sleep [S35]; Athletica recalculates zones after injury [S55]; Humango adjusts after injury but without consent semantics [S58]; POC3 has a 34-state catalog and gateway enforcement [POC3 COACH-STATES] | A safety/trust story that no competitor tells; needs user-facing explanation and clinical humility. |
| **Parity** | Garmin executed-workout import; per-km splits; laps/intervals; HR-zone time; PR badges; week/month/year log; load/ACWR | POC3 README vs [S1][S11][S45][S49] | Enough to be credible; not enough to win. |
| **Behind** | Mobile app, offline/PWA, reminders, plan templates, data export, wearable breadth, strength/cross-training, community, coach view, race-day logistics, onboarding, pricing/business model, automatic adaptation | Matrix §2; competitor evidence [S1][S25][S32][S44][S49][S53] | Table stakes or strategic liabilities; see §7–8. |
| **Unknown** | HR-zone boundaries, lifetime PRs, load-model transparency | POC3 stores zone time but not boundaries; PRs are period-limited [POC3 README] | Low urgency for acquisition; matters for trust and retention. |

**Honest read.** POC3 is not "ahead" overall. It is ahead on one axis that matters a lot (conversational control with proof) and behind on the axes that determine whether a runner can use it daily (mobile, reminders, templates, export). A positioning statement that claims "AI coach" will lose to Runna/Garmin on completeness; a positioning statement that claims "the coach that edits your calendar, with proof" is defensible.

---

## 6. POC3 differentiation opportunities (evidence-backed)

These are ranked by the combination of (a) strength of the competitor gap, (b) strength of runner evidence, (c) POC3's existing asset, and (d) the cost of being wrong. Each opportunity states the gap, the runner evidence, why POC3 is positioned to win, and what would make it fail.

### O1 — The coach that edits the calendar, with proof (strongest)

- **Competitor gap.** Every major AI feature in the benchmark is read-only: Strava Athlete Intelligence writes a summary [S17]; Garmin Active Intelligence has no reply box [S33][S34]; Athletica's AI Coach explicitly does not modify training [S54]; Runna's AI is post-run feedback [S28]; Humango's Hugo schedules but reviewers call it not meaningfully smart [S58]. COROS is the only product that lets AI write plans, and only through an external MCP assistant, 4–16 weeks, start within 14 days, no delete [S46].
- **Runner evidence.** Strava users ask for "an AI coach that actually helps you improve your weak spots… telling you when to add more speed work or adjust your training plan" [S18]. Garmin users ask for a "rigid skeleton that the algorithm fills in" and for the plan to respect their training days [S35]. Runna users describe making 5–6 changes to a marathon plan over two months and still fighting the app [S27]. The companion research finds N4 "re-plan without rebuilding" is a recurring, high-severity need (doc 02, N4).
- **Why POC3 is positioned to win.** It already has the hard part: a same-origin bubble that can read and animate the grid, a validated `propose_calendar_turn`, add/move/delete/revert, before/after change sets, undo, hidden directives and comment-only reviews [POC3 README; ADR-0001/0002]. Competitors would have to rebuild their calendar as a writable system of record; POC3 started there.
- **What would make it fail.** Model latency or validation failures that make the runner wait and retry; no diff preview (A3) so the runner cannot see what will change; no streaming (A4) so the bubble feels dead; no mobile so the runner cannot use it at the track; a single bad write (moved race, deleted long run) that undo does not make trustworthy; the audit page remaining an internal owner-only page instead of a runner-facing "what changed" history.
- **Evidence confidence.** High on the gap; high on POC3's asset; medium on runner willingness to pay for it.

### O2 — Plan intake from the artefacts runners already have (PDF, Sheets, WhatsApp, Reddit critique)

- **Competitor gap.** No benchmark product imports a runner's existing plan into an editable calendar with provenance. Strava plans are fixed/email [S13]; Runna generates its own [S25]; Garmin locks the plan to its ecosystem [S29][S30]; Nike plans are fixed [S39]; TrainingPeaks can host a plan but the runner needs a coach or a purchased plan [S4][S8]; Final Surge is coach-led [S23]. The market either generates a plan or hosts a coach's plan; it does not ingest *the runner's* plan.
- **Runner evidence.** Hal Higdon distributes free schedules and sells an interactive version through TrainingPeaks [S64]; Marathon Handbook offers a free plan database with Excel/customisation [S63]; runners build Excel sheets to generate plans [S65]; Google Sheets templates exist [S62]; Reddit is full of "rate my plan" threads where the plan is a list of long runs or a screenshot [S66]; coaches describe managing athletes with "a mix of spreadsheets and WhatsApp" and call it "a mess" [S67]. The companion research finds N3 "start from a trusted, recognisable plan" is high-severity (doc 02, N3).
- **Why POC3 is positioned to win.** The LLM can read a plan as text (PDF, sheet, message) and turn it into dated sessions; the calendar batch write can place a whole block; the coach can preserve the plan's provenance ("Higdon Novice 1, 18 weeks, 4 days") and let the runner edit it in language. This is a natural extension of the existing `propose_calendar_turn`, not a new architecture. PoC1 had plan uploads; POC3 has no upload surface yet (backlog B7 is templates, not import).
- **What would make it fail.** Parse errors that place wrong dates or distances without a confirmation step; no file-upload UI; no template library or plan schema; no provenance; no export back to the runner's original format; licensing/terms issues with copyrighted plans; a bad import that takes longer to fix than retyping the plan.
- **Evidence confidence.** High on demand; medium on POC3's current ability (not built); medium on legal/product constraints.

### O3 — Guardrailed coaching states with explicit consent

- **Competitor gap.** Garmin's readiness logic can silently replace a hard session after a poor night's sleep [S35]; Athletica's injury path recalculates thresholds in a way a reviewer found "totally not reflective" of actual fitness [S55]; Runna's aggressive plans are repeatedly linked by reviewers to injuries [S26][S27]; Humango lets a runner remove a sport/injury and adjust the schedule, which a reviewer liked better than TrainingPeaks [S58]; TrainingPeaks/Final Surge rely on the human coach for judgement [S2][S24]. No competitor documents a state catalog with consent semantics and gateway enforcement.
- **Runner evidence.** The companion research finds N16 "pain → modify or stop, with a way back", N17 "know what load increase is safe", N18 "resume after illness/travel", N11 "load and ACWR translated into an action" (doc 02). The Garmin thread shows runners want to decide whether to push through or take it easy, not have the watch decide [S35]. The Athletica review shows what happens when an injury corrupts the plan's zones [S55].
- **Why POC3 is positioned to win.** It already has a 34-state catalog in ten families, deterministic race/load/consistency detectors, chat/user proposals, `observing` states for sensitive conditions, user precedence, TTL/expiry, a seven-day dismissal cooldown, a 180-day retention window, an immutable event log and gateway guardrails over the effective post-turn calendar [POC3 COACH-STATES]. That is a genuine safety/trust asset, not a prompt.
- **What would make it fail.** Heuristic false positives (ACWR/race detection) that annoy the runner; no wellness/HRV/sleep data, so "load" is Garmin load only; no clinician partnership or referral pathway beyond copy; states feeling like surveillance; no user-facing explanation of why a session was blocked; sensitive states being inferred despite the rule.
- **Evidence confidence.** High on POC3's asset; medium on demand (runners say they want control, but may not shop for a state engine); low on clinical efficacy.

### O4 — Explainable AI: audit, undo, diff preview

- **Competitor gap.** AI in the benchmark is opaque by default: Athletica's metrics are described as a "black box" [S55]; Humango's initial plan creation "isn't very transparent" [S58]; Runna's adaptation is perceived as driven by completion clicks [S27]; Garmin's Active Intelligence is a one-way summary [S33]. No competitor shows the runner a before/after change set for an AI plan edit.
- **Runner evidence.** The companion research's F11 "trust, transparency & control" family (doc 02 family map) captures the need; competitor reviews show distrust when the system changes the plan without explanation [S27][S35][S55]. TrainingPeaks users argue that basic schedule moves should be free [S7], which is a control expectation, not a price complaint.
- **Why POC3 is positioned to win.** Every batch is stored with before/after snapshots; undo is requested in chat; the gateway enforces write permission; the audit page shows hidden directives, blocked writes and state transitions [POC3 README]. The missing piece is runner-facing: a "what changed" card, a diff preview before apply, and a visible history (the current undo has "no history panel").
- **What would make it fail.** Audit remains an internal owner-only page; no diff preview; no redo/selective revert; the explanation is technical rather than human ("validation failed" instead of "I moved Thursday's tempo to Saturday because you said you were travelling"); the runner never sees the change set unless they ask.
- **Evidence confidence.** High on the gap and the asset; medium on whether runners will read an audit view (probably not) versus a one-line "here's what changed" (probably yes).

### O5 — Race-week command center

- **Competitor gap.** Race-week support is either device-native and opaque (Garmin race widget/DSW [S30][S35]), plan-native (Runna race-day guidance [S25]), predictor-heavy (COROS race predictor [S45]; Athletica race predictions criticised [S55]), or human-coach-dependent (TrainingPeaks Coach [S6]). No product ties race week to the runner's actual calendar with guardrails, a countdown, pacing and post-race return in one place.
- **Runner evidence.** The companion research finds N20 "race-week execution", N21 "race-day pacing plan", N22 "taper madness reassurance" and N23 "post-race recovery and return" (doc 02). Garmin users praise the periodisation/race structure but criticise the plan moving [S35]; Runna users value race-day guidance [S25]; Athletica's race prediction failure shows the risk of overclaiming [S55].
- **Why POC3 is positioned to win.** It already detects race day/week, taper and post-race as states, blocks intervals on race week and enforces guardrails over the calendar [POC3 COACH-STATES]. A race countdown card, a race-week brief, a pacing/effort plan and a post-race return block are natural extensions of the existing calendar and state engine.
- **What would make it fail.** No race result capture, no countdown, no pacing logic, no logistics (course, weather, travel), no post-race return plan; overclaiming prediction like Athletica; treating taper as a generic state rather than a runner-facing explanation.
- **Evidence confidence.** High on demand; medium on POC3's current asset (states exist, race-day product does not).

### O6 — A private, social-free training space (differentiated, but risky)

- **Competitor gap.** Strava is a social network with segments, challenges and AI summaries [S11][S17]; Garmin adds badges/challenges and LiveTrack [S32]; Nike adds community challenges [S39]; Runna adds community/support [S25]. None offers a private calendar-first coach with no feed, no segments and no social comparison.
- **Runner evidence.** Strava users describe the social/addiction loop and say they would cancel if not for the social graph; they also say the AI is "AI slop" [S18]. The companion research's F10/F11 families capture social/community and trust/control needs (doc 02). Some runners want a quiet space; others want accountability.
- **Why POC3 is positioned to win.** Private by design, per-user isolation, no feed, no segments, no public leaderboards. It can be the "training diary that talks back" rather than another performance stage.
- **What would make it fail.** Privacy is not a motivator for most runners; without social accountability, adherence drops; no coach/community means no support; the niche may be too small to sustain a product; runners still use Strava for the social graph, so POC3 becomes a second app.
- **Evidence confidence.** Medium on differentiation; low on market size. This is a positioning option, not a proven opportunity.

### 6.1 Opportunity ranking (decision aid)

| Rank | Opportunity | Gap strength | Runner evidence | POC3 asset | Effort to make credible | Main risk |
|---|---|---|---|---|---|---|
| 1 | O1 Conversational calendar control with proof | Very high | High | Very high | Low–medium (diff preview, mobile) | Trust/latency |
| 2 | O2 Plan intake from PDF/Sheets/WhatsApp | High | High | Medium (LLM + batch write; no upload) | Medium | Parse/legal/provenance |
| 3 | O3 Guardrailed states with consent | High | Medium | High | Low–medium (user-facing explanation) | False positives/clinical |
| 4 | O4 Explainable AI (audit/undo/diff) | High | Medium | High | Low | Runners don't read audits |
| 5 | O5 Race-week command center | Medium | High | Medium | Medium | Prediction overreach |
| 6 | O6 Private social-free space | Medium | Low–medium | High | Low | Niche too small |

---

## 7. Threats and fast-follow risks

### 7.1 Table stakes: capabilities a competitor already gives away free

| Capability | Who gives it away | POC3 status | Risk if POC3 does not match | Minimum response |
|---|---|---|---|---|
| Free plan/templates | Garmin Coach [S31], Nike [S39], COROS [S48], TrainingPeaks Basic plans [S3], Final Surge athlete [S20], Intervals.icu [S49] | Absent (B7 open) | Runner sees no starting point; POC3 feels like a blank chat | Template library or plan import (O2) |
| Free log/analytics | Strava [S11], TrainingPeaks Basic [S3], Final Surge [S20], Intervals.icu [S49], COROS [S44] | Parity on log; no mobile | Runner cannot check the week on the phone | PWA/mobile + export |
| AI summaries/insights | Strava Athlete Intelligence [S17], Garmin Connect+ [S32], Runna Workout Insights [S28] | Stronger native chat, but web-only | "AI coach" is not a differentiator by itself | Make the *write* and *proof* the story, not the summary |
| Mobile app | All 12 competitors except Intervals.icu (which has third-party apps) [S51] | Absent | Calendar-first is phone-first; the product is unusable at the track | PWA first, native later |
| Reminders/notifications | Garmin, Runna, NRC, COROS, others | Bell is sync feed only (A7 open) | The plan is passive; adherence suffers | Per-session reminder + weekly nudge |
| Data export | TrainingPeaks [S4], Strava [S11], Final Surge [S20], COROS [S45], Intervals.icu [S49] | Absent (C7 open) | Trust gap; runner cannot leave with their data | CSV/ICS/SQLite backup |
| Watch sync breadth | TrainingPeaks [S1], Final Surge [S24], Runna [S25], Intervals.icu [S49], Athletica [S54], Humango [S57] | Garmin only | Non-Garmin runners excluded | Strava/COROS/Apple as later sources |
| Strength/cross-training | TrainingPeaks [S1], Runna [S26], Garmin [S32], COROS [S48], Intervals.icu [S49], Athletica [S55], Humango [S57] | Absent | Strength is part of most plans; calendar is incomplete | Strength session type + simple log |
| Race plans | Garmin [S30], Runna [S25], NRC [S39], COROS [S45], Athletica [S55], Humango [S57] | Partial (states only) | Race week feels unsupported | Race countdown + race-week brief (O5) |
| Coach view | TrainingPeaks Coach [S2], Final Surge [S21], COROS [S44], Intervals.icu [S49], Humango [S57] | Absent (non-goal) | Cannot serve coaches; no paid wedge | Decide: partner/export or stay out |

### 7.2 Non-goals that are strategic liabilities

| Non-goal | Why it is a liability | Evidence | Strategic options |
|---|---|---|---|
| **No mobile app** | The calendar is a phone object; runners check the week, move a session and start a run on the phone. Every competitor except Intervals.icu has a mobile app [S51]. | Garmin/Runna/NRC/Strava mobile-first workflows [S25][S35][S39]; POC3 backlog A10 | Build a PWA immediately; native later. This is the highest-urgency non-goal to revisit. |
| **No Strava** | Strava owns the runner's activity identity and social graph; without it POC3 is a second place to log. But adding Strava conflicts with the privacy niche (O6). | Strava's 200M users and social loop [S16][S18]; POC3 non-goal [POC3 README] | Stay private but offer export/ICS; or integrate read-only later as a source, not a social feed. |
| **No payments** | Free competitors set the price floor; without a business model POC3 cannot fund mobile, support or model costs. | Garmin/Nike/COROS/Intervals free tiers [S31][S39][S44][S49]; POC3 non-goal | Decide a paid wedge (coach view? race week? plan import?) before building more free surface. |
| **No external calendar sync** | Google Calendar is the runner's real calendar; TrainingPeaks offers an ICS export URL for Google/Outlook/Apple [S4]. A private calendar that cannot leave POC3 is a walled garden. | Google Calendar product [S60]; TP calendar export [S4]; N1 calendar evidence (doc 02) | Read-only ICS export first; two-way sync later if the product demands it. |
| **No multi-tenancy / coach view** | The coach market is where recurring money is (TrainingPeaks Coach $21.99+/mo [S2]; Final Surge $19–$39/mo [S21]; Coach Match $149–$359/mo [S6]). POC3 cannot serve it. | Coach platform pricing [S2][S6][S21]; COROS/Intervals coach tools [S44][S49] | Stay self-coached; partner with a coach platform via export; revisit if a coach asks. |
| **No wellness/HRV/sleep** | Guardrails rely on self-report; Garmin/Whoop have the data. POC3 cannot match readiness-aware coaching. | Garmin Connect+ health data [S32][S33]; POC3 limit [POC3 README] | Keep states runner-set; integrate one wellness source only if it changes a decision. |
| **No production multi-tenancy** | The PoC cannot scale beyond a private server; this is an engineering constraint, not a product position. | POC3 README limits | Keep private until the wedge is validated; do not pretend to be a commercial service. |

### 7.3 Fast-follow risks (what a competitor could ship before POC3)

| Risk | Who | Evidence | POC3 exposure | Fast-follow response |
|---|---|---|---|---|
| **Strava + Runna becomes one training product** | Strava/Runna | Runna acquired Apr 2025 [S14]; running plans moved to Runna [S12]; bundle $149.99/yr [S9]; Runna shipping 20+ features in 2026 [S15] | High: distribution + plan + AI + social in one app | Do not compete on social; compete on private calendar writes and proof |
| **Garmin Connect+ adds a conversational coach** | Garmin | Connect+ launched Mar 2025 [S32]; Active Intelligence one-way today [S33][S34]; Garmin has the data and install base | High: free plans + device + AI | Win on cross-device calendar, runner control and transparency; Garmin's incentive is to keep data in Garmin |
| **COROS MCP makes AI plan-writing ordinary** | COROS | External AI can create/edit plans/workouts, 4–16 weeks, start ≤14 days, no delete [S46] | Medium–high: free with hardware, coach/team layer | Offer a better write UX (validation, undo, diff) and a runner-facing audit; COROS's limits are real |
| **Intervals.icu MCP makes free AI analysis ordinary** | Intervals.icu | Free core + $4/mo supporter with MCP [S49]; 200k athletes [S49] | Medium: free depth + AI for power users | Do not compete on chart depth; compete on calendar-first coaching and simplicity |
| **Athletica/Humango make conversational AI plans ordinary** | Athletica, Humango | Athletica AI Coach chat [S53][S54]; Humango Hugo [S56][S57] | Medium: AI plan + chat, but read-only | POC3's write/undo is the differentiator; add templates/onboarding to match intake |
| **TrainingPeaks adds an AI coach to the coach platform** | TrainingPeaks | Data depth + coach distribution; no native AI coach verified [S1][S4][S6] | Medium: coach distribution + data depth | POC3 cannot win coaches; win self-coached runners who want proof/control |
| **Runna fixes aggressive paces and calendar bugs** | Runna | Reviewers report both [S26][S27]; Runna is investing in academic guidance and Holiday Mode [S15] | High: if Runna fixes its weaknesses, POC3's "better editing" is less unique | Keep the calendar-write + guardrail + audit trio; do not rely on Runna's bugs |
| **A free AI calendar agent appears** | New entrant / LLM wrapper | The cost of an LLM + calendar UI is low; COROS/Intervals already expose MCP [S46][S49] | Medium: commoditised chat + calendar | The moat is validation, guardrails, audit and trust — not the model call |

### 7.4 What must be true within 90 days

1. **Mobile/PWA:** the calendar is usable on a phone, with a "today" view and session reminder.
2. **Diff preview + user-facing "what changed":** the runner sees the before/after before or immediately after a coach write.
3. **Plan intake/templates:** at least one named plan template and one import path (PDF/Sheets/text) with provenance.
4. **Export:** CSV/ICS/SQLite backup; a runner can leave with their data.
5. **Week/agenda view:** the plan can be seen as a week, not only a month grid.
6. **Reminder:** at least one per-session notification channel (browser/email) with opt-out.

If these six are not true, POC3 can still be a compelling demo, but it cannot be judged against Runna/Garmin/Strava as a daily runner product.

---

## 8. Source ledger (S1–S68)

**Access date:** every source below was accessed on **2026-11-18**. The "Date" column gives the publication/update date where the page states one; otherwise it shows the access date. POC3 repository documents (`README.md`, `docs/...`) are cited inline and are not part of the S series. **Type codes:** [V] vendor page, [H] vendor help center, [P] press release, [R] independent review/news, [C] community thread, [X] third-party comparison. **Reliability:** High = vendor documentation or dated primary source; Medium = independent/third-party with a stated method; Low = self-selected community anecdote or search-index summary. No paywalled source was used.

**Fetch limitation (from review 06 F-17/F-18):** two cited pages return a JavaScript shell to a plain fetch -- the Garmin Coach overview (S30) and the Final Surge pricing page (S21). Their rows are marked as marketing or snippet-only; re-check them in a browser before making a pricing or feature decision.

| ID | Source (title — publisher) | URL | Type | Date | Claim supported | Reliability |
|---|---|---|---|---|---|---|
| S1 | Pricing for Athletes — TrainingPeaks | https://www.trainingpeaks.com/pricing/for-athletes/ | V | 2026-11-18 | Premium $11.25/mo billed annually ($134.99/yr); planning, device sync, strength, Peak Performances, coach communication; Bronze coaching $149/mo | High |
| S2 | Pricing for Coaches — TrainingPeaks | https://www.trainingpeaks.com/pricing/for-coaches/ | V | 2026-11-18 | Coach Edition from $21.99/mo; 4 Basic + 1 Premium athlete; $9/mo extra Premium; $99 start-up fee; 5+ Basic $54.99 base | High |
| S3 | Basic vs Premium Athlete Accounts — TrainingPeaks Help Center | https://help.trainingpeaks.com/hc/en-us/articles/204074014-Basic-vs-Premium-Athlete-Accounts | H | 2026-11-18 | Free Basic account; Premium monthly $19.95, yearly $134.99, 14-day trial (search-index detail) | High |
| S4 | The Complete TrainingPeaks Athlete User Guide — TrainingPeaks | https://www.trainingpeaks.com/learn/trainingpeaks-athlete-user-guide/ | H | 2026-11-18 | Calendar, ATP, dashboard, coach sharing, calendar export URL for Google/Outlook/Apple (Premium only) | High |
| S5 | Why do my running TSS values seem wrong? — TrainingPeaks Help Center | https://help.trainingpeaks.com/hc/en-us/articles/13293242078989-Why-do-my-running-TSS-values-seem-wrong | H | 2023-02-21 | Running TSS can use power/pace/HR; power data can make TSS unrealistic; troubleshooting steps | High |
| S6 | Find a Coach — TrainingPeaks | https://www.trainingpeaks.com/coach-match/ | V | 2026-11-18 | Coach Match questionnaire; accredited coaches; Bronze $149, Silver $229, Gold $359 per month; 30-day guarantee | High |
| S7 | Is trainingpeaks premium worth it today? — r/trainingpeaks | https://www.reddit.com/r/trainingpeaks/comments/1hfjnbs/is_trainingpeaks_premium_worth_it_today/ | C | 2026-11-18 | Users: moving/bumping workouts should be free; analytics useful; Intervals.icu offers more for free | Low–Medium |
| S8 | The Comprehensive Guide to Creating an Annual Training Plan — TrainingPeaks | https://www.trainingpeaks.com/learn/articles/the-comprehensive-guide-to-creating-an-annual-training-plan/ | V | 2021-04-21 | ATP is a macro-level periodisation tool for long-term planning | High |
| S9 | Strava Subscription — Strava | https://www.strava.com/subscribe | V | 2026-11-18 | Free vs subscription feature table; localized $5.00/mo billed $59.99/yr shown; Strava+Runna $12.50/mo billed $149.99/yr | High but region-variable |
| S10 | Updating Subscription Prices — Strava | https://www.strava.com/pricing | V | 2025-07-01 | Prices consistent by country; China $7.99/mo or $59.99/yr; Strava+Runna $149.99/yr; local currency | High but geo-specific |
| S11 | What Features Are Included in a Strava Subscription? — Strava Help Center | https://support.strava.com/en-us/articles/15402044-what-features-are-included-in-a-strava-subscription | H | 2026-09-10 | Training plans, Fitness & Freshness, Training Log, Best Efforts (mobile only), custom HR zones, pace analysis, Recover Athletics | High |
| S12 | Training Plans for Runners — Strava Help Center | https://support.strava.com/en-us/articles/15401942-training-plans-for-runners | H | 2026-09-17 | Running plans moved to Runna effective 10 July; 2-week trial code; bundle | High |
| S13 | Training Plans for Cyclists — Strava Help Center | https://support.strava.com/en-us/articles/15401867-training-plans-for-cyclists | H | 2026-09-17 | 10 customizable 4-week plans, 5 workouts/week, fixed days, email delivery, no pause | High |
| S14 | Strava to Acquire Runna — Strava Press | https://press.strava.com/articles/strava-to-acquire-runna-a-leading-running-training-app | P | 2025-04-17 | Acquisition; 150M users; apps separate; Runna 180 countries | High for announcement |
| S15 | Runna Announces Five New Product Updates and Two New Coaches — Strava Press | https://press.strava.com/articles/runna-announces-five-new-product-updates-and-two-new-coaches | P | 2026-11-12 | Holiday Mode, 7-day plans, new Home tab, 20+ features in 2026; injury stat observational | High for claims |
| S16 | Strava Now Integrated As A Connected App in Google Gemini — Strava Press | https://press.strava.com/articles/strava-now-integrated-as-a-connected-app-in-google-gemini-enabling-users-to-get-more-personalized-training-insights | P | 2026-10-28 | Subscribers connect Strava to Gemini read-only; Claude launch; US rollout | High |
| S17 | Athlete Intelligence on Strava — Strava Help Center | https://support.strava.com/en-us/articles/15401629-athlete-intelligence-on-strava | H | 2026-09-18 | Generative AI summaries; subscriber-only; mobile-only; can hide; supported sports | High |
| S18 | Is "Athlete Intelligence" actually useful? — r/Strava | https://www.reddit.com/r/Strava/comments/1l0zw94/is_athlete_intelligence_actually_useful/ | C | 2026-11-18 | Users call summaries useless; want AI that adjusts plan; social/addiction comments | Low–Medium |
| S19 | Strava Acquires Runna: Quick Thoughts Going Forward — DC Rainmaker | https://www.dcrainmaker.com/2025/04/strava-acquires-runna-thoughts-forward.html | R | 2025-04-17 | Runna premium-only $119/yr, 7-day trial, 90k members; AI plans commodity; API concerns | Medium–High |
| S20 | Final Surge — Workout Log for Athletes and Coaches — Final Surge | https://www.finalsurge.com/ | V | 2026-11-18 | Free online training log for athletes/coaches/teams/clubs | High |
| S21 | Pricing — Final Surge | https://www.finalsurge.com/pricing | V | 2026-11-18 | Free personal; Coach Starter 1–5; Pro up to 100; no setup fees; 14-day trial; prices not rendered to crawler | High for tiers; Medium for price |
| S22 | Final Surge Pricing 2026 — CoachBox | https://coachbox.app/en/compare/final-surge-pricing/ | X | 2026-11-18 | Starter $19/mo, Pro $39/mo, $190/$390 yearly | Medium |
| S23 | Workout Library & Structured Workouts with Multiple Target Types — Final Surge Help Center | https://support.finalsurge.com/hc/en-us/articles/360040884454-Workout-Library-Structured-Workouts-with-Multiple-Target-Types | H | 2019-12-30 | Workout library and structured workouts with HR/power/pace targets | High |
| S24 | Is final surge worth it? — r/AdvancedRunning | https://www.reddit.com/r/AdvancedRunning/comments/uckng2/is_final_surge_worth_it/ | C | 2026-11-18 | Less complicated than TP; Garmin sync; lap times require setup; coach says TP easier to build workouts | Low–Medium |
| S25 | Pricing — Runna | https://www.runna.com/pricing | V | 2026-11-18 | $119.99/yr ($9.99/mo, save 50%); monthly; 7-day trial; personalized/adaptive plans; device sync | High |
| S26 | RUNNA HONEST REVIEWS NEEDED — r/runna | https://www.reddit.com/r/runna/comments/1rsdwg8/runna_honest_reviews_needed/ | C | 2026-11-18 | Praise structure/sync/convenience/strength; criticism paces too fast, aggressive, calendar bugs, post-acquisition decline; some prefer ChatGPT | Low–Medium |
| S27 | Runna Premium worth it? — r/Marathon_Training | https://www.reddit.com/r/Marathon_Training/comments/1ekeodc/runna_premium_worth_it/ | C | 2026-11-18 | Garmin free plans alternative; aggressive plans; adaptation perceived as click-based; strength praised; injury concerns | Low–Medium |
| S28 | What Are Workout Insights? — Runna Support | https://support.runna.com/en/articles/10494265-what-are-workout-insights | H | 2026-11-18 | Post-run AI-generated feedback; not a plan-editing chat | High |
| S29 | What Are Garmin Daily Suggested Workouts? — Garmin Support | https://support.garmin.com/en-US/?faq=oYknGZ910l1pfBNzkDHX6A | H | 2026-11-18 | DSW are personalized recommendations generated on compatible watches/Edge | High |
| S30 | Garmin Coach Overview — App Based Training Plans — Garmin | https://www.garmin.com/en-US/garmin-coach/overview/ | V | 2026-11-18 | App-based plans; select plans adjust to performance/recovery; can push harder/miss | High (marketing) |
| S31 | Garmin Coach — Garmin Technology — Garmin | https://www.garmin.com/en-US/garmin-technology/garmin-coach/ | V | 2026-11-18 | "Garmin Coach delivers free custom plans"; prebuilt running/cycling/strength/triathlon plans | High (marketing) |
| S32 | Elevate your health and fitness goals with Garmin Connect+ — Garmin Newsroom | https://www.garmin.com/en-US/newsroom/press-release/wearables-health/elevate-your-health-and-fitness-goals-with-garmin-connect/ | P | 2025-03-27 | Connect+ 30-day trial; $6.99/mo or $69.99/yr | High |
| S33 | Garmin Connect+ Paid Subscription: Hands-on Thoughts & Analysis — DC Rainmaker | https://www.dcrainmaker.com/2025/03/garmin-connect-plus-subscription-walkthrough.html | R | 2025-03-27 | Active Intelligence exact quotes; Performance Dashboard, Training Guidance, LiveTrack, badges; $6.99/$69.99; criticism | Medium–High |
| S34 | Is Garmin Connect+ worth it? — stats.training | https://stats.training/blog/is-garmin-connect-plus-worth-it | R | 2026-06-14 | Active Intelligence talks at you, no follow-up, data locked in Garmin app; $6.99 | Medium (vendor-adjacent) |
| S35 | Garmin coach is seriously flawed... — r/Garmin | https://www.reddit.com/r/Garmin/comments/1s2hg82/garmin_coach_is_seriously_flawed_and_its/ | C | 2026-11-18 | Min 5 runs/week; too conservative; constant reshuffling; sleep overrides; sync bugs; named coaches differ | Low–Medium |
| S36 | Runkeeper Go — ASICS Runkeeper | https://runkeeper.com/go | V | 2026-11-18 | Go $11.99/mo or $39.99/yr; plans 5K–marathon, progress insights, workout comparison, live tracking | High |
| S37 | Runkeeper App Review 2026 — Motera | https://www.motera.app/runkeeper-app | R | 2026-11-18 (n.d.) | ASICS-owned since 2016; development slowed; Go $9.99/mo or $39.99/yr; pros/cons | Medium (affiliate) |
| S38 | Runkeeper vs Strava (2026) — Run & Grow | https://www.runandgrow.com/blog/runkeeper-vs-strava | R | 2026-11-18 | US App Store lists Go $39.99/yr or $9.99–$11.99/mo | Medium |
| S39 | Running Training Plans — Nike | https://www.nike.com/running/training-plans | V | 2026-11-18 | Holistic plans; guided runs; 8-week plans; NRC app | High (marketing) |
| S40 | Half-Marathon Training Plan — Nike | https://www.nike.com/running/half-marathon-training-plan | V | 2026-11-18 | Choose 3/4/5 guided runs per week; daily guidance | High (marketing) |
| S41 | Nike Run Club App — Nike | https://www.nike.com/nrc-app | V | 2026-11-18 | Audio-guided runs for beginner-to-marathon | High (marketing) |
| S42 | Has anyone used Nike Run Club plans? — r/XXRunning | https://www.reddit.com/r/XXRunning/comments/1en4rdt/has_anyone_used_nike_run_club_plans/ | C | 2026-11-18 | 8-week plan with five runs/week feels aggressive | Low |
| S43 | Anyone else having problems with Nike Run Club lately? — r/nikerunclub | https://www.reddit.com/r/nikerunclub/comments/1w5jv3z/anyone_else_having_problems_with_nike_run_club/ | C | 2026-11-18 | Crash/regression reports | Low |
| S44 | COROS Training Hub — COROS | https://coros.com/traininghub | V | 2026-11-18 | Free web portal; EvoLab; plan building; coach tools; teams; notifications | High (marketing) |
| S45 | COROS Training Hub Manual — COROS Help Center | https://support.coros.com/hc/en-us/articles/4412176269844-COROS-Training-Hub-Manual | H | 2024-06-12 | Web-based; calendar; plan library; workout library; teams; EvoLab metrics | High |
| S46 | Connect Your COROS to AI — COROS Help Center | https://support.coros.com/hc/en-us/articles/50841795180948-Connect-Your-COROS-to-AI | H | 2026-09-18 | MCP; external AI creates/edits plans/workouts; 4–16 weeks; start ≤14 days; no delete via AI | High |
| S47 | Training Hub has to be the most useless thing provided by COROS — r/Coros | https://www.reddit.com/r/Coros/comments/1t68mo2/training_hub_has_to_be_the_most_useless_thing/ | C | 2026-11-18 | CRUD gaps, FIT import errors; plan/workout building praised | Low–Medium |
| S48 | COROS Training Plans & Workouts — COROS | https://us.coros.com/training | V | 2026-11-18 | Free plan/workout library incl. strength | High |
| S49 | Free Cycling, Running, Triathlon Training Platform — Intervals.icu | https://www.intervals.icu/ | V | 2026-11-18 | Free; $4/mo supporter; calendar, workout builder, fitness chart, custom zones, MCP, 200k athletes | High |
| S50 | Training Calendar — Intervals.icu | https://www.intervals.icu/features/training-calendar/ | V | 2026-11-18 | Drag-drop calendar, third-party imports, workout library, sync, weekly totals | High |
| S51 | Intervals.ICU Companion App — Intervals.icu Forum | https://forum.intervals.icu/t/intervals-icu-companion-app/92715 | C | 2025-03-04 | No official app; third-party companions; PWA possible; mobile UX complaints | Medium |
| S52 | Training Plans — Intervals.icu | https://www.intervals.icu/features/training-plan-editor/ | V | 2026-11-18 | Drag-drop plan editor, link to athletes, bulk apply | High |
| S53 | Adaptive Endurance Training Plans — Athletica | https://athletica.ai/ | V | 2026-11-18 | Adaptive plans; conversational AI Coach; Workout Wizard; app; AI doesn't modify plan | High (marketing) |
| S54 | Pricing: One Plan, Every Feature — Athletica | https://athletica.ai/pricing | V | 2026-11-18 | $19.90/mo, $99/6mo, $189/yr, 2-week trial; sync; AI doesn't change plan | High |
| S55 | Athletica.ai Review after Marathon Training Block - Two Thumbs Down — Athletica Forum | https://forum.athletica.ai/t/athletica-ai-review-after-marathon-training-block-two-thumbs-down/4904 | C | 2026-05-04 | Injury threshold recalculation, race prediction off, heavy volume, no long/MP runs, black-box metrics; staff reply | Medium (single user) |
| S56 | HumanGO — Humango | https://humango.ai/ | V | 2026-11-18 | Hugo AI coach; personalized feedback; adapts to schedule/fatigue; athletes/coaches/teams | High (marketing) |
| S57 | Get The App — Humango | https://humango.ai/gethumango | V | 2026-11-18 | Essential $16.99/mo; Premium $28.99/mo; 14-day trial; recalibration tests; race planner | High (marketing) |
| S58 | My review of HumanGo as a training planner — r/triathlon | https://www.reddit.com/r/triathlon/comments/1o5u9hw/my_review_of_humango_as_a_training_planner/ | C | 2026-11-18 | Flexible moving, Garmin sync, injury/sport removal adjusts; analysis limited; AI gimmicky; €20/mo not justified | Low–Medium |
| S59 | I'm feeling completely unchallenged by HumanGo — r/triathlon | https://www.reddit.com/r/triathlon/comments/1prsks7/im_feeling_completely_unchallenged_by_humango/ | C | 2026-11-18 | Structure/accountability but undertraining | Low |
| S60 | Shareable Online Calendar and Scheduling — Google Workspace | https://workspace.google.com/products/calendar/ | V | 2026-11-18 | Google Calendar product page (Chinese locale returned) | High for existence |
| S61 | About communities — WhatsApp FAQ | https://faq.whatsapp.com/495856382464992 | H | 2026-11-18 | Communities bring members together in topic-based groups; announcements (Chinese locale returned; Telegram not separately sourced) | High |
| S62 | Google Sheets Running / Training Log — Cheat Sheets | https://www.cheatsheets.blog/post/running-log | X | 2026-11-18 | Sheets template for run tracking; 10 training plans | Low–Medium |
| S63 | Marathon Training Plans: Free Database for All Levels — Marathon Handbook | https://marathonhandbook.com/marathon-training-plan-database/ | X | 2026-11-18 | Free plan database; Excel/customizable plans | Medium |
| S64 | Marathon Training for All Skill Levels — Hal Higdon | https://www.halhigdon.com/training/marathon-training/ | V | 2026-11-18 | Free schedules; interactive via TrainingPeaks; 18-week Novice 1, 4 days/week | High |
| S65 | Excel Marathon Training Log Sheets? — r/XXRunning | https://www.reddit.com/r/XXRunning/comments/6648xe/excel_marathon_training_log_sheets/ | C | 2026-11-18 | Runners build Excel sheets to generate plans | Low |
| S66 | Rate my training plan (first marathon) — r/Marathon_Training | https://www.reddit.com/r/Marathon_Training/comments/1ml8dpw/rate_my_training_plan_first_marathon/ | C | 2026-11-18 | Plan critique; commenters ask for full plan; WhatsApp groups for Dublin prep | Low |
| S67 | What do you actually use to manage your athletes' training? — r/running | https://www.reddit.com/r/running/comments/1rbh6cm/what_do_you_actually_use_to_manage_your_athletes/ | C | 2026-11-18 | Coaches use spreadsheets + WhatsApp; Final Surge praised; Intervals/TP recommended | Low–Medium |
| S68 | Is Strava Premium worth it? (2026) — Run & Grow | https://www.runandgrow.com/blog/is-strava-premium-worth-it | R | 2026-10-21 | US Strava $11.99/mo or $79.99/yr; UK/AU prices | Medium |

**Source count:** 68 distinct URLs, 12 competitor products, 8 adjacent-behaviour sources. **Access date:** 2026-11-18 for all rows.

---

## 9. Traceability: which competitor evidence supports which opportunity

### 9.1 Evidence-to-opportunity table

| Opportunity | Competitor gap evidence | Runner evidence | POC3 asset | Cross-ref (doc 02) | Confidence | Falsifier |
|---|---|---|---|---|---|---|
| **O1** Conversational calendar control with proof | Strava AI read-only [S17]; Garmin one-way [S33][S34]; Athletica no writes [S54]; Runna insights only [S28]; COROS MCP partial [S46] | r/Strava asks for plan-adjusting AI [S18]; r/Garmin wants control [S35]; Runna users fight the plan [S27] | Bubble + validated writes + undo + audit [POC3 README] | N4; F11 (doc 02 family map) | High | Runners prefer a tap-based editor; model errors make writes untrustworthy |
| **O2** Plan intake from PDF/Sheets/WhatsApp | Strava fixed/email [S13]; Runna generated only [S25]; Garmin locked [S29]; TP coach/plan purchase [S4][S8]; NRC fixed [S39] | Higdon free plans [S64]; Sheets/Excel [S62][S63][S65]; Reddit critique [S66]; coaches' spreadsheet+WhatsApp mess [S67] | LLM parse + batch write; no upload yet | N1, N3 | High demand; medium build | Parse errors; legal issues; no provenance; worse than retyping |
| **O3** Guardrailed states with consent | Garmin sleep override [S35]; Athletica injury recalculation [S55]; Runna injuries [S26][S27]; Humango injury removal [S58]; TP/FS human coach [S2][S24] | Runners want to decide whether to push [S35]; pain/illness/return needs (doc 02) | 34-state catalog + gateway enforcement [POC3 COACH-STATES] | N11, N16, N17, N18 | High asset; medium demand | False positives; no wellness data; clinical overreach |
| **O4** Explainable AI (audit/undo/diff) | Athletica black box [S55]; Humango opaque creation [S58]; Runna click-based adaptation [S27]; Garmin one-way [S33] | Trust/control need (doc 02 F11); TP users want basic moves free [S7] | Change sets, undo, audit page [POC3 README] | F11 (doc 02 family map) | High gap; medium demand | Runners ignore audit; no diff preview; explanations too technical |
| **O5** Race-week command center | Garmin race widget [S30]; Runna race-day guidance [S25]; COROS predictor [S45]; Athletica prediction criticised [S55]; TP coach [S6] | Race-week/taper/pacing needs (doc 02) [N20–N23]; Garmin race structure praised [S35] | Race/taper/post-race states + guardrails [POC3 COACH-STATES] | N20, N21, N22, N23 | Medium–high | No countdown/pacing/logistics; prediction overreach |
| **O6** Private social-free space | Strava social/segments [S11][S18]; Garmin badges [S32]; NRC community [S39]; Runna community [S25] | Social/addiction comments [S18]; privacy/trust needs (doc 02 F10/F11) | Private calendar + per-user isolation [POC3 README] | F10, F11 | Medium differentiation; low market size | Runners need accountability; niche too small |

### 9.2 Support matrix (competitor evidence × opportunity)

| Evidence family | O1 | O2 | O3 | O4 | O5 | O6 |
|---|---|---|---|---|---|---|
| **Garmin** (Coach/DSW/Connect+) [S29]–[S35] | ◐ (one-way AI; device flow) | ◐ (locked plans; free plans set floor) | ● (sleep overrides; minimum days) | ◐ (opaque plan changes) | ● (race widget/phase) | ○ (Garmin is social/badges) |
| **Strava** [S9]–[S19] | ◐ (AI read-only; plans moved) | ◐ (email/fixed plans) | ○ (no guardrails) | ◐ (opaque AI summaries) | ◐ (plans/community) | ● (social pressure/segments) |
| **Runna** [S25]–[S28] | ● (AI insights; no chat writes) | ◐ (generated plans only) | ● (aggressive plans/injuries) | ◐ (click-based adaptation) | ● (race-day guidance) | ◐ (community) |
| **Athletica** [S53]–[S55] | ● (AI chat; no writes) | ◐ (generated plans only) | ● (injury threshold bug) | ● (black-box metrics) | ● (race prediction) | ○ (no social layer) |
| **Humango** [S56]–[S59] | ◐ (Hugo schedules; limited) | ◐ (generated plans only) | ● (injury/sport removal) | ◐ (opaque creation) | ● (race planner) | ◐ (teams) |
| **COROS** [S44]–[S48] | ● (MCP writes with limits) | ◐ (plan library, coach-led) | ◐ (recovery status) | ◐ (web hub) | ● (race predictor) | ● (teams) |
| **TrainingPeaks / TPC** [S1]–[S8] | ○ (no native chat) | ◐ (plan purchase/coach) | ◐ (human coach) | ◐ (complex metrics) | ● (coach race week) | ○ (no social feed) |
| **Final Surge** [S20]–[S24] | ○ (no AI) | ◐ (coach-led plans) | ◐ (human coach) | ○ (simple log) | ◐ (coach race week) | ◐ (teams/clubs) |
| **Intervals.icu** [S49]–[S52] | ◐ (MCP, no native chat) | ● (plan editor) | ○ (no guardrails) | ◐ (charts, no audit) | ◐ (CTL/plan) | ● (forum/teams) |
| **Runkeeper / NRC** [S36]–[S43] | ○ (no AI coach) | ◐ (fixed plans) | ○ (no guardrails) | ○ (simple metrics) | ◐ (plans/community) | ◐ (friends/challenges) |
| **Adjacent behaviours** [S60]–[S67] | ◐ (calendar/Sheets as workaround) | ● (PDF/Sheets/WhatsApp intake) | ◐ (runner self-manages injury) | ◐ (runner keeps own log) | ◐ (race-week manual) | ◐ (private/WhatsApp/Telegram groups) |

**How to read the matrix.** ● means the competitor evidence *strongly* supports the opportunity (usually by documenting the gap or the failure mode); ◐ means partial/indirect; ○ means no relevant evidence. It is not a score of the competitor's quality.

### 9.3 Evidence gaps to close before committing to build

1. **TrainingPeaks native AI chat:** TrainingPeaks' AI positioning may become a real coach; verify before assuming TP is read-only.
2. **Final Surge load model:** if it has TSS/CTL/ATL, POC3's load parity claim narrows.
3. **Runkeeper/NRC load models:** unknown; do not claim POC3 is "ahead" on load without checking.
4. **Willingness to pay:** no pricing research exists for a calendar-first AI coach; the $119.99/yr Runna price and $19.90/mo Athletica price are the closest anchors [S25][S54].
5. **Mobile/PWA demand:** the competitor evidence is strong that mobile matters, but no POC3 user test exists; treat as a product bet, not a proven need.
6. **Coach-view demand:** the paid coach market is documented [S2][S6][S21], but POC3 has no coach users; do not build a coach view on inference alone.

---

## 10. Appendix

### 10.1 Claims I could not verify (and therefore did not use as facts)

- Strava's **US** price is from independent reviews, not Strava's own page in this session; the vendor page is country-localized [S9][S10][S68].
- Runkeeper's **monthly** price is inconsistent ($11.99 official vs $9.99 third-party); the annual $39.99 is consistent [S36][S37][S38].
- Final Surge's **exact** coach price is not rendered on its own pricing page; $19/$39 comes from the indexed page and a third-party comparison [S21][S22].
- Garmin's **minimum five runs/week** is a reviewer claim about the adaptive Garmin Coach, not a vendor statement; named coaches differ [S35].
- Runna's **injury-rate reduction** is an observational vendor metric; Runna's own methodology note says it does not establish causation [S15].
- Athletica's **race-prediction error** is one reviewer's experience, not a measured product defect; Athletica staff say race prediction is not a feature [S55].
- Humango's **"hyper-personalized"** claim is vendor marketing; reviewers describe the AI as limited [S56][S58].
- COROS's **AI plan-writing** is documented as available from 21 September 2026; I did not test it, and the help page says delete via AI is not supported [S46].

### 10.2 Access notes (transparency)

- **Google Calendar** and **WhatsApp FAQ** returned Chinese-locale pages; the product/feature claims are simple existence claims and are not affected, but the exact wording is locale-specific [S60][S61].
- **Nike** and **Humango** marketing pages are JavaScript-heavy; I used search-index summaries for some feature claims and flagged them as marketing [S39]–[S41][S56][S57].
- **Final Surge** pricing is dynamically rendered; the tier names were visible, prices were not [S21].
- **Reddit** threads were read through a page scraper; vote counts and comment ordering are as displayed on 2026-11-18 and may change.
- **No paywalled source and no hands-on competitor test:** no account, trial or app was used; every "works well" claim is attributed to a reviewer, not to this analysis.

### 10.3 Decision summary for the POC3 owner

1. **Protect the wedge.** The calendar-write coach with validation, undo and audit is the only capability in this benchmark that no competitor ships natively. Do not dilute it into "another AI plan app".
2. **Make the proof visible.** Add a diff preview and a runner-facing "what changed" card before adding more coach intelligence. Trust is the product.
3. **Close the mobile gap first.** A PWA with a today view and one reminder is worth more than another analytics chart. This is the highest-urgency non-goal to revisit.
4. **Add plan intake/templates.** Runners already have PDFs, Sheets and WhatsApp plans; importing them is the natural extension of the calendar-first bet and the fastest way to match Runna's onboarding without copying its generator.
5. **Keep the guardrails, explain them.** The state engine is a genuine safety/trust asset; make it legible ("why did the coach block this?") and keep sensitive states consent-based.
6. **Do not build a social network or a coach marketplace.** They are losing battles against Strava and TrainingPeaks. Export/ICS and a coach handoff are the pragmatic interfaces.
7. **Price the wedge, not the dashboard.** The market gives away logs, plans and AI summaries. The paid product, if any, is control/trust/race-week/coach handoff, not "insights".
8. **Be honest about the PoC.** POC3 is a private proof of concept with no mobile, payments or multi-tenancy. The competitive analysis says the idea is differentiated; it does not say the product is complete.

**Change log:** 2026-11-18 initial version; 68 sources, 12 competitor profiles, 26-row matrix, workflow/positioning/opportunity/threat analysis, ledger and traceability. Corrections must update the ledger row and the affected matrix footnote, not just the prose.
