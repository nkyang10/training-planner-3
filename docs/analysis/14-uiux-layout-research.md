# Tabs, panes and overlays: a research review of layout grammar for dense planning interfaces

**Evidence review and heuristic audit of the POC3 coach dock and page regroup**

**Status:** secondary research + heuristic audit (no primary user study yet). **Date:** 2026-11-20.
**Scope:** web app, 390–1440 px, en / zh-HK, WCAG 2.2 AA. **Prepared for:** the POC3 calendar-first running coach.

---

## Executive summary

The evidence supports the direction shipped in POC3: a persistent coach should **reflow the page** rather than cover it, and page content should be **grouped by the job the runner is doing**. The dock, the Chat / States / Changes grouping, the history Days / Review switch and the activity and muscle two-column layouts all match documented guidance. The measured result is a large reduction in covered content and page length (overlap 242,572 px² → 0; history 2,198 → 1,547 px; states 1,722 → 1,231 px; activity 2,233 → 1,647 px).

The evidence also sets limits that the current implementation does not yet fully respect:

1. **Tabs are not a density cure.** They hide content, add a click and a memory burden, and are the wrong control when users must compare sections, read in order, or notice safety-relevant status. They work best for **2–4 clearly labelled, mutually exclusive sections**, with the most important section first and visible active state [6][16][17].
2. **Side-by-side is justified by comparison or reference, not by page length.** Two columns help when the runner needs both sets of information in view; they hurt when the runner must integrate sources that should have been one unit (split-attention effect) [3][38]. They must reflow without two-dimensional scrolling at 320 CSS px [3].
3. **A persistent assistant should be non-modal.** Modal overlays interrupt the task, hide context and force recovery; they are appropriate for short, focused, high-consequence tasks, not for ongoing assistance [8][21][29][31]. If an overlay is used at narrow widths, focus must not be obscured: trap or inert the background, close on Escape and restore focus [1][4].
4. **POC3 has three material gaps**, all fixable without another redesign:
   - the drawer/sheet locks scroll but does **not** make the background inert, so keyboard focus can move behind the overlay (WCAG 2.4.11 risk) [4];
   - the in-page `.seg-tabs` control is a **radio group / segmented control**, not the ARIA tabs pattern, while the dock's tabs are ARIA tabs — the same visual grammar behaves differently for keyboard and screen-reader users [2][30];
   - the history **Review** tab hides training load, a safety-relevant metric, with no always-visible load summary [6][9][15].

The report recommends a P0 accessibility pass, a P1 discoverability/IA pass, and a P2 measurement programme. The largest remaining layout question is not “which page needs more tabs”; it is **which information is primary at each width and which control makes the secondary job cheap to reach**.

---

## 1. Research question and scope

This review answers four questions:

- **RQ1.** How should a persistent AI assistant be composed with a dense planning surface across desktop, tablet and phone widths?
- **RQ2.** When should content be grouped into tabs, side-by-side panes, disclosures or overlays?
- **RQ3.** Which accessibility semantics and responsive behaviours are required for those choices to be usable by keyboard and screen-reader users?
- **RQ4.** How should the resulting design be validated empirically?

The scope is the POC3 web interface: a calendar-first running coach with a persistent assistant, a training log, activity detail, muscle check-ins and coaching states. Native mobile apps, visual branding and dark mode are out of scope. The review covers English and zh-HK labels because tab width and label length are part of the layout problem.

---

## 2. Method and evidence base

This is a **narrative literature review plus a heuristic audit**, not a systematic review or a primary usability study. Sources were gathered in November 2026 from standards bodies, platform design systems, UX research organisations and the human-AI interaction literature. The review deliberately separates normative requirements from consensus guidance and from practitioner pattern collections.

| Tier | Sources | What it can support | What it cannot support |
|---|---|---|---|
| **Normative** | WCAG 2.2 [1], WAI-ARIA Authoring Practices [2] | Testable accessibility requirements; roles, states and keyboard behaviour | General usability or aesthetic judgement |
| **Empirical / peer-reviewed** | Hick–Hyman [32], Miller [33], Sweller and Chandler’s split-attention work [38], Fitts [36] | Limits of choice, memory, attention and target acquisition | Direct prescriptions for this product |
| **Design-system guidance** | GOV.UK [16], Carbon [17], Fluent 2 [18], Material 3 [19]–[24], Apple HIG [26]–[31] | Platform conventions, component selection, responsive patterns | Controlled evidence; guidance is consensus-based |
| **Expert synthesis** | Nielsen Norman Group [6]–[15], Laws of UX [32]–[36], Butterick [37] | Heuristics, pattern trade-offs, reading and scanning research | Causal proof in this context |
| **Practitioner / pattern collections** | assistant-ui [41], Kraftbase [42], Google PAIR [43] | Examples of AI assistant side panels and pattern vocabulary | Evidence of effectiveness |

**Inclusion:** English-language standards, design-system documentation, research syntheses and peer-reviewed work; sources current in 2024–2026, with classic HCI/psychology work where it remains the primary reference. **Exclusion:** undated listicles, marketing pages and vendor comparisons without a design rationale.

**Analysis:** thematic synthesis, then a structured heuristic audit of the POC3 implementation against the resulting rules. The audit uses the rendered pages and measurements recorded in [the layout review](13-layout-review.md), not a new user sample.

**Limitations of the method** are stated in §12. In particular, most evidence comes from web navigation, content pages and instructional design, not from persistent AI coach panels in a calendar app. Transfer to POC3 is an inference that needs empirical confirmation.

---

## 3. Theoretical framework

### 3.1 Perception: grouping is not decoration

Gestalt psychology explains why layout changes feel like information-architecture changes. **Proximity** makes nearby objects read as related [34]; **common region** makes a shared boundary read as a group [35]. Visual hierarchy then directs the eye by contrast, scale and grouping [14]. In practice:

- A card is a common region; a tab strip is a common region for *navigation*, not for content.
- Two columns read as two groups even when the content is sequential; a single column reads as one sequence.
- A floating panel reads as a layer above the page, not as part of the page, because it shares no boundary with the content and overlaps it.

These are perceptual effects, not preferences. They explain why “just put it in a panel” changes perceived ownership and why a docked column feels like part of the workspace while a floating bubble feels like an interruption.

### 3.2 Cognition: choice, memory and attention

- **Hick’s law:** decision time rises with the number and complexity of choices [32]. Tabs reduce the number of *visible* choices but add a switching choice; the net benefit depends on how often the runner needs the hidden content.
- **Miller’s law / chunking:** working memory is limited, but the “7 ± 2” figure is not a design cap; the useful lesson is to chunk content into meaningful units [13][33]. A tab is a chunk of navigation; a card is a chunk of content.
- **Recognition over recall:** recognition is easier than recall because it supplies more cues [10]. Tabs hide content, so the runner must remember that a section exists and what it contains. This is why tab labels, counts and visible summaries matter.
- **Cognitive load:** interfaces impose intrinsic load (the task) and extraneous load (the interface). Grouping, clear hierarchy and progressive disclosure reduce extraneous load; hidden content that must be remembered can increase it [12].
- **Interaction cost:** every click, scroll, attention switch and item held in memory adds cost [11]. A tab adds a click but can remove a long scroll; an overlay adds an attention switch and can hide the context the user needs to act.
- **Split attention:** when information that must be integrated is separated, extraneous load rises; integrated formats often outperform separated ones [38]. This is a caution against side-by-side layouts that force the eye to jump between sources that should be read as one.

### 3.3 Information architecture: one job per visible group

The practical synthesis is a **layout grammar**:

1. **One job per visible group.** Conversation, decisions (states), audit (changes), planning, logging and body status are different jobs with different lifecycles.
2. **Primary content stays visible.** The first screen should answer the most frequent question, not the most complete one.
3. **Secondary content is cheap to reach and clearly signposted.** Progressive disclosure works only when the progression is obvious and the label sets the right expectation [7].
4. **Comparison is a first-class task.** If the runner must compare, put the comparable things side by side; do not force memory and tab switching [6][17].
5. **Safety-relevant status is never only behind a tab.** Load, pain, illness and injury signals belong in an always-visible summary or a badge, even when their detail lives in a tab [9][15].

---

## 4. Pattern taxonomy and decision matrix

### 4.1 The patterns in play

| Pattern | What it is good at | Characteristic cost |
|---|---|---|
| **Segmented control** | A single choice among a small set of views of the same content [30] | Selected state must be clear; too many segments become cramped |
| **Tabs** | A few long, clearly labelled, mutually exclusive sections; one primary section [6][16] | Hides content; adds a click; comparison becomes memory work |
| **Side-by-side panes** | Peer content that must be referenced or compared at the same time [3][6][17] | Uses width; can create split attention; must collapse at 320 px |
| **Disclosure / accordion** | Many short secondary sections; a mini-IA of headings [9][16] | Hides content; each open is a decision; awareness drops |
| **Docked panel** | Persistent assistance that must coexist with the main task [4][21] | Consumes a column; needs a sensible breakpoint; content must reflow |
| **Drawer / sheet** | A focused task or contextual panel on a narrow screen [21][29] | Overlays content; needs focus management, Escape and restore |
| **Modal dialog** | A high-consequence decision or warning that must interrupt [8] | Blocks the task; causes forgetting and context recovery |
| **Inline banner / badge** | Status, counts and change notifications without interrupting [15][39] | Easy to ignore; needs a clear next action |

### 4.2 Decision matrix

| The runner needs to… | First choice | Acceptable second choice | Avoid | Key evidence |
|---|---|---|---|---|
| Switch between 2–4 views of the same content | Segmented control or tabs | Disclosure | Overlay | [6][16][30] |
| Compare two runs, two weeks, or plan vs actual | Side-by-side panes | Toggle with a persistent summary | Tabs alone | [3][6][17] |
| Keep coaching available while editing the calendar | Docked non-modal panel | Collapsible rail | Modal drawer on desktop | [4][8][21] |
| Do a short focused task on a phone | Modal sheet or drawer with focus trap | Full-screen page | Docked panel | [8][29][31] |
| Read many short secondary sections | Accordion | Disclosure | Tabs with overflow | [9][16] |
| Read a few long sections | Tabs | Side-by-side if comparison is needed | Accordion with many open | [6][16] |
| Follow a linear process | Steps / progress indicator | Single page with headings | Tabs | [16][17] |
| Filter or switch the format of the same content | Content switcher / segmented control | Dropdown | Tabs | [17][30] |
| Notice a safety-relevant status | Always-visible summary or badge | Inline banner | A tab only | [9][15] |

The matrix is a starting point, not a law. The rest of the report explains the conditions behind each row.

---

## 5. Evidence review by pattern

### 5.1 Tabs and segmented controls

#### 5.1.1 What tabs are, semantically

The WAI-ARIA Authoring Practices define tabs as a set of layered sections: a `tablist` containing `tab` elements, each controlling a `tabpanel`; the active tab has `aria-selected="true"`, the others `false`; the tablist has an accessible label; each tab has `aria-controls`; each panel has `aria-labelledby` [2]. Keyboard behaviour is specific: Tab moves into the tablist onto the active tab, Left/Right arrows move between tabs (wrapping), Home/End optionally jump to the first/last, and Space/Enter activates a tab when activation is manual. Automatic activation on focus is recommended when panels are preloaded and display without noticeable latency; otherwise it slows keyboard navigation [2]. If a panel contains no focusable content, the panel itself should be in the tab sequence with `tabindex="0"` [2].

This matters because “looks like tabs” is not the same as “is tabs”. A row of radio buttons that swaps panels is a **segmented control** or a radio group, not the ARIA tabs pattern. Both can be legitimate; they have different semantics, keyboard models and screen-reader announcements. Mixing the visual language of one with the semantics of the other creates a consistency problem (§9).

#### 5.1.2 When tabs work

The sources converge on a small set of conditions:

- **The content has clear groupings** and the groupings are long enough to justify a separate view [6].
- **There are few groups.** When tabs overflow, the strip becomes a carousel; hidden tabs become less discoverable and the interaction cost rises [6]. Fluent 2 states that horizontal tabs do not scroll or wrap [18]; Material’s scrollable tabs leave some tabs off-screen until scrolled [19]. Overflow is a design failure, not a feature.
- **The first section is the most relevant for most users.** The default tab receives disproportionate attention; non-default tabs may be ignored, so their content should be supplemental rather than critical [6][16].
- **Labels are short and parallel.** Short labels conserve width and make the set scannable [6]. “Current / Set a state / History” is a good set because the words are distinct jobs, not internal categories.
- **Users do not need to see the sections simultaneously.** If they do, tabs force repeated switching and memory work [6].
- **The service is used regularly.** GOV.UK notes that tabs can work well for frequent users of a caseworking system, where speed matters more than first-time simplicity [16]. A running coach used several times a week fits that profile better than a one-off marketing page.

#### 5.1.3 When tabs fail

- **Comparison.** GOV.UK: do not use tabs if users might need to compare information in different tabs [16]. Carbon: tabs should not be used when the user needs to compare information in different groups [17]. NN/g: users must repeatedly switch to compare or reference, which taxes short-term memory and lowers usability [6]. This is the strongest, most consistent finding in the review.
- **Linear reading.** GOV.UK: do not use tabs if users need to read through all content in order, for example a step-by-step process [16]. Carbon points to a progress indicator for linear processes [17].
- **Page navigation.** GOV.UK: do not use tabs as a form of page navigation, and do not use them when the total content would make the page slow to load [16].
- **Many or overflowing sections.** A carousel of tabs hides options; the hidden tabs are less discoverable and cost extra manipulation [6][18][19].
- **Critical content in a non-default tab.** The default tab gets the attention; content that is critical for safe use should not be the one users must discover [6][16].
- **Content that users do not notice.** GOV.UK is explicit: “Tabs hide content from users and not everyone will notice them or understand how they work” [16]. This is a discoverability warning, not a reason to avoid tabs entirely.

GOV.UK’s recommended test is to **try the content without tabs first**: simplify, split across pages, keep it on one page with headings, or use a table of contents [16]. That is the right default for a new page; tabs are a deliberate reduction, not a default.

#### 5.1.4 Tabs versus accordions

NN/g summarises the trade-off: tabs suit a few long content sections; accordions fit many short ones [6]. GOV.UK’s decision guidance adds: if the user does not need more than one section at a time, consider tabs; if they need to switch quickly, tabs show content without pushing other sections down; if there are many pieces, tabs fit fewer sections because they are horizontal, while accordions are vertical; for one or two short, less important pieces, a details/disclosure component is smaller and less prominent [16].

The accordion evidence is a useful counterweight to “tab everything”. Accordions shorten the page and provide a mini-IA, but they increase interaction cost, force a decision per heading, and **diminish awareness of hidden content** [9]. NN/g also notes that users do scroll when content is relevant: in eyetracking research, users spend about 80% of attention above the fold and 20% below, but that does not mean long pages are bad; it means priority matters [9]. The lesson is not “avoid tabs” or “avoid scrolling”; it is **put the primary job first and make the secondary job cheap to reach**.

#### 5.1.5 Segmented controls

Apple defines a segmented control as offering **a single choice from among a set of options** [30]. That is exactly the interaction of a radio group: one selected segment, mutually exclusive. Common guidance puts segmented controls at a small number of options for switching views of the same content [30]. Carbon’s content switcher covers filtering or switching the format of the same content, as opposed to navigating between content groups [17].

The design implication is precise: **if the control swaps panels of content, decide whether the semantic model is “tabs” (ARIA tablist/tab/tabpanel) or “single choice among views” (radio group / segmented control).** The visual treatment can be similar, but the keyboard model, the screen-reader announcement and the documentation should match the chosen model. Native radios already provide a correct single-choice model and work without JavaScript; ARIA tabs provide a correct panel-navigation model and need the APG keyboard contract.

#### 5.1.6 Convergence table

| Source | When tabs are appropriate | When not | Additional rule |
|---|---|---|---|
| NN/g [6] | Few clear groupings; unequal importance; concise labels; no simultaneous view | Comparison; many/overflowing tabs | Default tab gets the attention |
| GOV.UK [16] | Clearly labelled sections; first section most relevant; users will not need all at once; regular users | Comparison; linear reading; page navigation; slow load | Test without tabs first |
| Carbon [17] | Related content in the same context; forms, settings, dashboards | Comparison; filtering the same content; linear progress | Use content switcher / progress indicator instead |
| Material 3 [19] | Grouping content into categories across screens/data sets | — | Primary vs secondary tabs; scrollable tabs have off-screen items |
| Apple HIG [26][30] | Tab bar for switching app sections; segmented control for a single choice among views | Using a tab bar where a sidebar/split view fits the hierarchy | Tab bar sits at the bottom edge; segmented control is single-choice |
| Fluent 2 [18] | Horizontal tablist for related views | Overflow; horizontal tabs do not scroll or wrap | Plan the tab count for the available width |

---

### 5.2 Side-by-side panes

#### 5.2.1 The legitimate case: comparison and reference

Side-by-side layout is justified when the runner needs **both sets of information in view at the same time**. The WCAG reflow guidance gives a concrete example: reviewing code or document changes in two columns can be easier than stacking the original and modified blocks, because the comparison happens on the same horizontal plane and does not require scrolling back and forth [3]. NN/g’s tabs guidance reaches the same conclusion from the other direction: if users need to compare information under different tabs, tabs are the wrong pattern because they force memory and switching [6]. Carbon says the same [17].

The design test is therefore: **is the task comparison/reference, or is it sequential reading?** If comparison, side-by-side; if sequential, a single column is usually better. Page length alone is not a reason to add a column.

#### 5.2.2 The split-attention caveat

The split-attention effect shows that when learners must integrate information from separate sources, separating those sources increases extraneous cognitive load; integrated formats often produce better learning and faster performance [38]. This is a caution, not a ban on side-by-side. The distinction is whether the two sources are **peers that the user reads independently** or **parts of one explanation that must be integrated**.

- Activity detail: the Garmin program and the muscles-worked card are peers. The runner may read the program, then look at the muscles; they are not two halves of one sentence. Side-by-side is defensible.
- History: the week’s day cards and the load/trend cards are related, but the runner usually wants one or the other at a time. Tabs are defensible; a permanent side-by-side split would force the trend to compete with the week.
- A form and its help text: these must be integrated; side-by-side can create split attention if the help is far from the field. Keep help adjacent to the field, not in a separate column.

#### 5.2.3 Width, line length and reading order

Two columns reduce the width available to each. Butterick recommends an average line length of **45–90 characters**, including spaces [37]; NN/g’s chunking guidance narrows the working range to **50–75 characters** for web text [13]. A 340 px coach dock at 16 px type is roughly 40–50 characters, which is comfortable for conversation; the main column at 826 px can exceed 75 characters if it contains prose. The calendar is a grid, not prose, so character count is not the right metric there; card text and forms still benefit from a maximum measure.

Side-by-side layouts must also preserve **meaningful reading order** when they collapse. WCAG 2.2 requires content to reflow at a width equivalent to **320 CSS pixels** without two-dimensional scrolling, except for content that genuinely needs two-dimensional layout (tables, maps, video, presentations) [3]. A two-column card grid therefore has to reflow; for this kind of content that usually means a single column in DOM order, and the DOM order must make sense. CSS `grid-template-columns` does not change the DOM order, but a visual order that differs from the DOM order can confuse keyboard and screen-reader users; WCAG 1.3.2 (Meaningful Sequence) and 2.4.3 (Focus Order) apply [1].

#### 5.2.4 Responsive breakpoints

Material 3’s adaptive layout guidance uses window size classes: compact, medium, expanded, large and extra-large. Large and extra-large begin at **1200 dp**; expanded covers roughly **840–1199 dp** [23][25]. Material’s navigation-drawer guidance uses **standard drawers in expanded widths 840–1199 dp** and modal drawers primarily in compact and medium widths [20]. Material’s navigation rail is the mid-sized-device counterpart: a narrow side rail with 3–7 destinations [22]. It is a navigation control, not a content pane, but it shows the same principle: at intermediate widths, a persistent side surface can be cheaper than an overlay. Apple’s split views manage multiple adjacent panes, with sidebars for deeper hierarchies and tab bars at the bottom edge for compact navigation [26]–[28].

These are starting points, not universal truths. The right breakpoint depends on **content density**, not only device class. A 340 px coach column at 1024 px would leave about 77 px per calendar cell in a seven-column month grid, which is below a usable cell width; that is why POC3 overlays at 1024 and docks at 1200. The design-system classes explain the neighbourhood; the content explains the exact line.

#### 5.2.5 POC3 application

| Surface | Breakpoint | Layout | Why it matches the evidence |
|---|---|---|---|
| Coach | ≥1200 px | Docked 340 px column, page reflows | Persistent assistance is non-modal; no content is covered; the page keeps a usable calendar width [4][21] |
| Coach | 721–1199 px | 380 px drawer under the app bar, scroll locked | The calendar needs the width; a drawer is a narrower-screen compromise, not a desktop default [20] |
| Coach | ≤720 px | Full-height sheet with tabs and a visible close | A phone cannot host two columns; the sheet is the focused-task pattern, with the caveat that focus must be managed [29][31] |
| Activity | ≥1024 px | Two columns: program/metrics/splits \| muscles/zones/laps | The cards are peers; side-by-side removes a long scroll [3][6] |
| Muscle | ≥1024 px | 360 px status/readings rail beside the check-in figure | The status is reference information; the figure is the action; both belong in view [6][11] |
| History | all widths | Days/Review tabs, one panel at a time | The runner wants one job at a time; the summary row stays visible [6][16] |

---

### 5.3 Overlays: drawers, sheets and modals

#### 5.3.1 The cost of modality

NN/g defines a modal dialog as a dialog that appears on top of the main content and moves the system into a special mode requiring interaction; it disables the main content until the user explicitly interacts with it [8]. The costs are well documented: it requires immediate attention, interrupts the workflow, causes users to forget context, adds an extra goal (dismiss the dialog), and blocks the content behind it [8]. Modal dialogs are appropriate for important warnings and critical errors, not for noncritical activities [8]. Nonmodal dialogs do not disable the main content; the user can continue interacting with the page while the dialog is open [8].

Material’s side sheets make the same distinction in component form: **standard side sheets** show secondary content anchored to the side of the screen; **modal side sheets** appear in front of app content [21]. The standard side sheet is the component analogue of the dock; the modal side sheet is the analogue of the phone sheet.

#### 5.3.2 Focus must not be obscured

WCAG 2.2 SC 2.4.11 (Focus Not Obscured, Minimum, AA) requires that when a component receives keyboard focus, it is not entirely hidden by author-created content [4]. The Understanding document discusses persistent user-opened content explicitly: a chat window is a persistent disclosure that “has the potential to fail” the criterion if it covers the focused item. It lists ways the pattern can pass: the additional content **displaces** existing content (accordion), existing content **reflows** (the WCAG site’s own pop-out sidebar), focus is constrained to the new content until dismissal, the disclosure opens into an unpopulated area, or the content can be hidden/collapsed by a keyboard command such as Escape [4]. A properly constructed modal dialog passes because it takes focus and constrains interaction [4].

This is the most important accessibility finding for POC3’s narrow-width drawer and phone sheet. The page behind the overlay is scroll-locked (`body.coach-open { overflow: hidden }`), but it is not `inert`, and the panel is not a modal dialog. A keyboard user can tab from the panel into the obscured page behind it. At 390 px the sheet covers essentially the whole viewport, so a focused background control can be entirely hidden. That is a 2.4.11 risk, and it also weakens the “visible close” benefit: the user may not know where focus went.

The fix is not necessarily to make the panel modal. The dock is a non-modal assistant by design. At narrow widths, the cleanest options are:

- make the page content **inert** while the sheet/drawer is open, leaving the panel and its close/launcher controls focusable; or
- implement a **focus trap** in the panel and restore focus to the launcher on close; or
- make the overlay a **proper modal dialog** (`role="dialog"`, `aria-modal="true"`, focus moved in, Escape, focus return), accepting the modality cost [2][4][8].

WCAG also warns that fixed/sticky content can obstruct zoomed content and recommends making such content static or dismissible at smaller sizes [3]. The POC3 drawer is fixed; the sheet is fixed; both should be tested at 200% and 400% zoom.

#### 5.3.3 When an overlay is the right answer

An overlay is defensible when all of the following hold:

1. the task is **focused and short** (a single decision, a small form, a confirmation);
2. the underlying page is **not needed** during the task;
3. the overlay is **clearly dismissible** (visible close, Escape, click-outside where appropriate);
4. focus is **moved into** the overlay and **returned** to the trigger;
5. the overlay does not hide **safety-critical status** the user needs to act.

Apple’s modality guidance is blunt: present content modally only when there is a clear benefit; keep modal tasks simple, short and streamlined; avoid creating a modal experience when a non-modal one will do [31]. Sheets are a targeted modal experience that prevents interaction with the parent view until dismissed [29]. That is appropriate for a phone check-in flow, not for the coach the runner wants to keep open while editing the calendar.

#### 5.3.4 Invocation and dismissal as first-class design

Microsoft’s Guidelines for Human-AI Interaction include **G7: Support efficient invocation** and **G8: Support efficient dismissal** [39][40]. For a persistent assistant, these are layout requirements: the launcher must be easy to find and reach, opening must be one action, closing must be one action, and the state must be obvious. POC3’s launcher, visible close, Escape handling and focus return are aligned. The missing piece is the disclosure semantics: the launcher does not currently expose `aria-expanded` or `aria-controls`, so assistive technology cannot tell whether the panel is open or what it controls. That is a small, high-value fix.

---

### 5.4 Progressive disclosure and accordions

NN/g’s definition of progressive disclosure is simple: initially show only a few important options; offer a larger set of specialised options on request; make the progression obvious and label it so the user knows what is behind the door [7]. The benefits are learnability, efficiency of use and error rate; the risks are hiding something the user needed and making the mechanism unclear [7]. The two things to get right are the **split** between initial and secondary features and the **obviousness** of the progression [7].

Tabs are one implementation of progressive disclosure. The evidence in §5.1 should be read through that lens: tabs are not free. They trade visible content for a smaller initial surface. That trade is good when the hidden content is genuinely secondary and the label has strong information scent; it is bad when the hidden content is critical, frequently needed, or needed simultaneously with the visible content.

The accordion evidence adds a second caution: hiding content behind headings **diminishes awareness** and adds interaction cost [9]. The NN/g eyetracking result (about 80% of attention above the fold, 20% below) is often misused to justify hiding everything below the fold; the same article says users do scroll when the content is relevant [9]. The practical rule is to **prioritise**, not to hide.

For POC3, this produces a specific critique of the history Review tab. Training load is not merely “advanced”; it is a safety-relevant signal (ramp, ACWR, hard/easy split). Putting it behind a tab and leaving only runs/distance/time/longest visible reduces awareness of the very thing the coach may warn about. The fix is not to remove the tab; it is to keep a **compact load summary** in the always-visible summary row (for example, a “Load 320 · rising” chip) and let the Review tab hold the explanation. That preserves the tab’s density benefit without hiding the signal.

---

## 6. Responsive and adaptive layout

### 6.1 Breakpoints are content hypotheses

Material’s window size classes are a vocabulary, not a prescription: compact, medium, expanded, large, extra-large; layouts typically move from a single pane to two or three panes as the window grows [23][24]. The exact transition points are opinionated and platform-specific. POC3 uses 1200 px for the dock because that is where a 340 px column leaves a usable month grid; it uses 1024 px for activity and muscle columns because those pages can afford narrower cards; it uses 720 px for the phone sheet because that is where a two-column workspace stops being credible.

The lesson from the design systems is to **name the widths and test the content at each one**, not to copy a device category. A calendar grid has a hard minimum cell width; a card list does not. The breakpoint should be derived from the content’s minimum viable width, then verified with users.

### 6.2 Reflow and zoom

WCAG 2.2 SC 1.4.10 requires content to reflow at a width equivalent to **320 CSS pixels** (or 256 px height for horizontal writing) without two-dimensional scrolling, except for content that genuinely needs two-dimensional layout [3]. The Understanding document gives concrete techniques: media queries and grid CSS to reflow columns (C32), flexbox (C31), max-width/flexbox for labels and inputs (C38), and making sticky headers/footers static at small sizes (C34) [3]. It also warns that fixed-position or sticky content can obscure zoomed content and recommends static positioning or a user toggle at smaller sizes [3].

POC3 has been captured at 390 px but not yet at 320 px or 400% zoom. The CSS suggests it will reflow (the app shell is a single column below 1200; the activity/muscle grids collapse at 1024; the sheet is inset 6 px), but this is a hypothesis until tested. The tab labels wrap (`flex-wrap: wrap`), which avoids horizontal overflow but can produce a two-row segmented control; that is acceptable if it remains readable and the active state is clear.

### 6.3 Sticky content and focus

The dock is sticky at ≥1200 px. Sticky content is not inherently a problem when it occupies its own grid column, because it does not overlap the main content. The drawer and sheet are fixed and do overlap; that is where 2.4.11 and 1.4.10 intersect. The audit should test:

- keyboard tab order with the drawer open at 721–1199 px;
- keyboard tab order with the sheet open at ≤720 px;
- 200% text zoom and 400% page zoom at 1280 px;
- 320 px width with the sheet closed and open;
- landscape phone orientation (the sheet is full-height; orientation must not be restricted).

### 6.4 Container queries versus viewport queries

The activity and muscle columns depend on the width of the **content area**, not the viewport. If the coach dock is open, the content area is 340 px narrower; a viewport breakpoint of 1024 px can therefore put two columns into a space that is really 684 px wide. POC3 currently uses viewport media queries. A more robust approach is a **container query** on the page content, or a `body.coach-open` override that raises the column breakpoint when the dock is open. This is a concrete responsive bug risk: at 1024 px with the dock open, the activity columns may be too narrow. The layout review captured 1024 with the dock open for the calendar, but not for activity/muscle; that is a gap to test.

---

## 7. Accessibility and internationalisation

### 7.1 Semantics: ARIA tabs or radio group

The dock’s tabs follow the ARIA tabs pattern: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, roving `tabindex`, arrow/Home/End handling, and `role="tabpanel"` with `aria-labelledby` [2]. That is the correct semantic model for “a set of layered sections, one shown at a time”.

The in-page `.seg-tabs` control uses native radio inputs and labels, with panels shown by sibling `:checked` CSS. That is a correct semantic model for a **single choice among views** (a segmented control), but it is **not** the ARIA tabs pattern: screen readers announce radio buttons, not tabs; there is no `aria-selected`, no `tabpanel`, and no “tab 2 of 3” announcement. The visual pill strip makes it look like tabs, which is why the mismatch matters.

There are two defensible resolutions:

1. **Call it a segmented control and keep the radios.** Add a fieldset/legend or `role="radiogroup"` with an accessible name, keep the native arrow-key behaviour, and document that it switches views rather than navigating tab panels. This is the lowest-risk, no-JavaScript option.
2. **Implement ARIA tabs with a small progressive-enhancement script.** Use `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, roving `tabindex`, Left/Right/Home/End, and Space/Enter if activation is manual. Keep a no-script fallback that shows all panels stacked (or a `<noscript>` hint), as the muscle plugin does. This is the better semantic match if the panels are the product’s primary content navigation.

Do not leave the current hybrid undocumented: it is usable for sighted keyboard users (native radios support arrow selection) but it does not deliver the tab semantics that the visual language promises.

### 7.2 Keyboard and focus

The APG keyboard contract is the baseline for tabs [2]. For the dock, POC3 implements arrow keys, Home/End, roving tabindex and Escape-to-launcher; that is aligned. For the page segmented controls, native radios provide Tab into the group and arrow selection, but not Home/End and not the tablist announcement. If the page control is kept as radios, that is acceptable for a segmented control; if it is meant to be tabs, it is incomplete.

Focus return is implemented for the dock (Escape returns to the launcher), which is good. The drawer/sheet background is not inert, so focus can leave the panel into obscured content; that is the P0 gap. The launcher should also expose `aria-expanded` and `aria-controls` so the open/closed state is programmatic, not only visual.

### 7.3 Target size, contrast and motion

WCAG 2.2 SC 2.5.8 requires pointer targets to be at least **24 × 24 CSS pixels**, or to have sufficient spacing; 2.5.5 (Enhanced) uses **44 × 44** [5]. POC3’s segmented labels are roughly 30 px high with 14 px horizontal padding; the dock tabs are similar; the close button is 32 px. These meet the 24 px minimum but not the 44 px enhanced target. That is acceptable for a desktop-first app, but the phone sheet should be tested with a thumb; 44 px is the safer target for the primary close and tab controls.

Contrast is not audited in this review. The active segmented label uses a white surface and a shadow, not colour alone, so it does not rely solely on colour to convey state (WCAG 1.4.1) [1]. The focus ring is ember on a light surface; it should be checked against 1.4.11 non-text contrast and 2.4.13 focus appearance.

Motion is covered globally: the stylesheet includes a `prefers-reduced-motion: reduce` block that collapses animations and transitions [1]. That is the right pattern; no further action is needed beyond keeping new transitions inside that rule.

### 7.4 Reflow and internationalisation

The app supports en and zh-HK. Chinese labels are usually shorter, but other locales (German, French) can be longer; tab labels must not be given fixed widths. The current labels are short (“Days”, “Review”, “Current”, “Set a state”, “History”; “每日”, “回顧”, “現況”, “設定狀態”, “記錄”), and the strip wraps if needed. The audit should test:

- 320 px width in en and zh-HK;
- 200% text zoom;
- long-label pseudo-locale (for example, a 30-character label) to confirm the strip wraps rather than overflows;
- RTL, if an RTL locale is added: the tab strip, arrow keys and close-button placement must follow `dir`; CSS logical properties are preferable to `left`/`right` [1].

---

## 8. AI assistant-specific considerations

### 8.1 Human-AI interaction guidelines

Microsoft’s 18 Guidelines for Human-AI Interaction are an evidence-based synthesis of more than 20 years of research [39][40]. The ones most relevant to layout are:

| Guideline | Layout implication in POC3 |
|---|---|
| **G1. Make clear what the system can do** | The launcher label and the empty chat state should say what the coach can change and what it cannot. |
| **G2. Make clear how well it can do it** | The panel should not imply certainty; the existing “proposed” vs “active” state distinction helps. |
| **G7. Support efficient invocation** | One-tap launcher, contextual Ask coach buttons, and a dock that stays available while editing. |
| **G8. Support efficient dismissal** | Visible close, Escape, focus return, and a minimize control on desktop. |
| **G11. Make clear why the system did what it did** | Change cards show the action and the affected day; the coach prompt carries context. |
| **G12. Remember recent interactions** | The conversation and change journal persist; the Changes tab exposes the last five sets. |
| **G18. Notify users about changes** | Badges on States and Changes; the unseen-batch watermark. |

Google’s PAIR guidebook covers adjacent ground for mental models, explainability and feedback [43]. The layout consequence is that the assistant should be **present but not modal**, **invocable from the context where the question arises**, and **dismissible without losing the runner’s place**. The dock satisfies this at ≥1200 px; the drawer/sheet is a narrower-screen compromise that needs the focus fixes in §5.3.

### 8.2 The side-panel pattern

Industry pattern collections describe the AI assistant side panel as a persistent, resizable panel for copilot experiences and contextual assistance: assistant-ui ships a resizable assistant sidebar [41], and practitioner taxonomies list side-panel chat as a core copilot pattern [42]. The pattern is not a modal chat window; it is a **secondary workspace** that coexists with the primary task. That matches the dock, not the overlay. The pattern also implies that the panel should be **resizable or collapsible** when the main task needs width; POC3’s desktop dock is fixed at 340 px, with a minimize control. A future improvement is a drag handle or a small/medium/large width preference, but that is a refinement, not a correctness issue.

### 8.3 What the AI guidance adds to the layout debate

The AI guidance shifts the emphasis from “where does the panel go” to **“how does the user stay in control”**. Efficient invocation/dismissal, clear capability, explainability and change notification are layout-visible properties: the launcher, the close, the tab labels, the badges, the change cards and the undo action. A layout that hides the close, hides the reason for a change, or makes the assistant modal fails these guidelines even if the panel is beautifully composed.

---

## 9. Heuristic audit of POC3

The audit uses the rendered pages, the DOM probes and the measurements in [the layout review](13-layout-review.md). Severity: **P0** blocks accessibility or safe use; **P1** harms discoverability or task success; **P2** polish/measurement.

| # | Finding | Evidence | Severity | Recommendation |
|---|---|---|---|---|
| 1 | Dock at ≥1200 reflows the page; no content covered | [3][4][21]; measured overlap 0 vs 242,572 px² | Pass | Keep |
| 2 | Chat / States / Changes grouping matches job lifecycles | [6][7][15]; 2–3 tabs, short labels | Pass | Keep |
| 3 | History Days/Review tabs put the week first | [6][16]; 2,198 → 1,547 px | Pass with caveat | Add an always-visible load summary (§9.1) |
| 4 | States Current/Set/History tabs reduce page length | [6][16]; 1,722 → 1,231 px | Pass with caveat | Add a head “Set a state” action and deep links |
| 5 | Activity two columns and head actions | [3][6][17]; 2,233 → 1,647 px | Pass with caveat | Test at 1024 px with the dock open |
| 6 | Muscle status rail beside the figure | [3][6]; figure above the fold at 1280 | Pass with caveat | Test at 1024 px; check rail wrapping |
| 7 | Drawer/sheet background not inert; focus can move behind overlay | [4]; `body.coach-open` only locks scroll | **P0** | Add `inert` to main/footer or a focus trap; test 2.4.11 |
| 8 | Launcher lacks `aria-expanded` / `aria-controls` | [2][15]; `#coach-bubble` has only `aria-label` | **P1** | Add disclosure semantics and update on open/close |
| 9 | `.seg-tabs` is a radio group presented as tabs | [2][30]; native radios, no tabpanel roles | **P1** | Standardise on segmented-control semantics or implement ARIA tabs |
| 10 | History Review hides training load | [6][9][15]; load only in the Review panel | **P1** | Add a compact load chip to the always-visible summary |
| 11 | Set-state form is only reachable through a tab | [7][16]; no head action, no deep link | **P2** | Add “Set a state” action and `?tab=set`/`#set` |
| 12 | Page tab state is not in the URL | [6]; reload resets to the first tab | **P2** | Persist tab in query/hash; support back/forward |
| 13 | Tab labels/overflow at 320 px and long locales untested | [3][18]; wrap behaviour exists but untested | **P1** | Test 320 px, 200%/400% zoom, pseudo-locale |
| 14 | Activity/muscle column breakpoint is viewport-based | [23]; dock open reduces content width | **P2** | Use container queries or a `body.coach-open` override |
| 15 | Mobile activity figure is ~3,500 px down | [11][36]; interaction cost | **P2** | Add a “Muscles” jump chip in the head |
| 16 | No tab-switch/scroll-depth analytics | [11]; cannot measure the layout hypothesis | **P2** | Instrument events and run the study in §11 |
| 17 | Reduced motion is covered globally | [1]; `prefers-reduced-motion` block | Pass | Keep |
| 18 | Target sizes meet 24 px, not 44 px | [5]; labels ~30 px, close 32 px | Pass with caveat | Use 44 px for phone close/tab targets |

### 9.1 The load-summary caveat, in detail

Training load is not just another metric. The load card contains the week load, ACWR, week-over-week change and hard/easy split; the card’s own warning text fires when the ramp is rising (see [the layout review](13-layout-review.md)). The history page now shows runs, distance, time and longest in the always-visible summary, and puts load behind the Review tab. A runner who opens “this week” to check whether the plan is sane sees the week rows first — good — but does not see the load warning unless they notice the Review tab. That is a **recognition** failure [10] and a **progressive-disclosure split** failure [7]: the hidden content is not merely advanced; it is safety-relevant.

The fix is small: add a compact load chip to the summary row or the Days panel header, for example `Load 320 · rising` with a link that activates the Review tab. The full explanation stays in Review. This preserves the tab and restores the signal.

### 9.2 The segmented-control caveat, in detail

The `.seg-tabs` component is one of the better pieces of the implementation: no JavaScript, native radio semantics, keyboard arrows, focus ring, no `:has` dependency, and a no-CSS fallback that shows all panels. It is also **not** the ARIA tabs pattern. The audit should not treat that as a bug in itself; it is a naming and consistency problem.

The dock’s tabs are ARIA tabs; the page controls look like tabs but behave as radios. A screen-reader user who learns the dock’s “tab 2 of 3” model will not get the same announcement on the history page. Two options, both defensible:

- **Rename and document** the page control as a segmented control, add `role="radiogroup"` or a fieldset/legend, and keep the no-JS behaviour. This is the smallest change and the most robust.
- **Implement ARIA tabs** for the page panels with a small script and a no-script stacked fallback. This is the more consistent experience but adds code and needs testing with the dock’s tab model.

Do not ship a third state: a visual tab strip with radio semantics and no documentation.

---

## 10. Recommendations

### P0 — accessibility and safe use

1. **Make the narrow-width overlay non-obscuring.** When the drawer (721–1199 px) or sheet (≤720 px) is open, set `inert` on the page shell and footer (or trap focus in the panel), keep the panel and its close/launcher focusable, close on Escape and restore focus to the launcher. Verify with a keyboard-only pass at 1024 and 390 px against WCAG 2.4.11 [4].
2. **Add disclosure semantics to the launcher.** `aria-expanded="false"`, `aria-controls="coach-panel"`, updated on open/close; keep the panel’s region label (or wire `aria-labelledby` to a visible title). This is a small fix with a large assistive-technology benefit [2][15].
3. **Test 320 px and 400% zoom.** Verify no horizontal scrolling, no clipped tab labels, no obscured focus, and that the sheet can be dismissed without a pointer [3][4].

### P1 — discoverability and information architecture

4. **Keep a load signal visible.** Add a compact load chip to the history summary (or the Days panel header) that links to the Review tab. Do not make safety-relevant status discoverable only by tab [7][9][15].
5. **Give the states page a head action.** Add “Set a state” beside the page title that activates the Set tab, and support `?tab=set` / `#set` so the action works without JavaScript and survives reload.
6. **Resolve the tab/segmented-control semantics.** Choose one model per control, document it, and test with a screen reader. Add Home/End only if the control is ARIA tabs [2].
7. **Test the 1024 px two-column layouts with the dock open.** If the columns are too narrow, raise the breakpoint under `body.coach-open` or switch to container queries.

### P2 — polish and measurement

8. **Persist page tab state in the URL** and support back/forward; add a deep link for Review/Set/History [6].
9. **Add a “Muscles” jump chip to the mobile activity head** to shorten the ~3,500 px path to the figure [11][36].
10. **Instrument the layout.** Events: `coach_open`, `coach_tab_select`, `history_tab_select`, `states_tab_select`, `activity_ask`, `muscle_checkin_start`; metrics: time to first action, tab switches per task, scroll depth, task success, abandonment.
11. **Run the evaluation in §11**; do not add more tabs before the load-summary and focus fixes are validated.

---

## 11. Proposed evaluation plan

### 11.1 Hypotheses

- **H1 (dock):** at ≥1200 px, the docked coach reduces time and errors for “move a run” and “ask about this week” tasks compared with the old overlay, and does not reduce calendar task success.
- **H2 (history):** the Days-first layout reduces time to find a day’s run compared with the summary-first layout, while a visible load chip preserves load awareness (measured by a follow-up question).
- **H3 (activity):** the two-column activity layout reduces scroll depth and time to the muscles card compared with the single column, without reducing comprehension of the program.
- **H4 (states):** the Current/Set/History tabs reduce time to set a state compared with the stacked page, but only when a head action or deep link is present.
- **H5 (semantics):** ARIA tabs improve screen-reader task success for switching panels compared with radio-based tabs; sighted performance is equivalent.
- **H6 (accessibility):** the inert/focus-managed drawer and sheet pass WCAG 2.2 AA for 2.4.11, 1.4.10 and 2.5.8 at 320 px and 400% zoom.

### 11.2 Formative rounds

- **Participants:** 5 per round, 3 rounds, runners who plan workouts weekly; include at least one keyboard-only and one screen-reader user per round where possible.
- **Method:** moderated, task-based think-aloud; counterbalanced order; 45–60 minutes.
- **Tasks:** find Friday’s session; move a long run; ask why the week’s load is rising; find the sore muscle and check in; set a race-phase state; find last week’s load.
- **Outputs:** severity-ranked issues, not preference votes.

### 11.3 Summative study

- **Design:** within-subject, counterbalanced, two layouts per task; or a between-subject A/B for the dock versus overlay.
- **Sample:** power analysis first; do not use n=5 for quantitative claims. For a moderate effect (d ≈ 0.5) in a between-subject design, the rough requirement is ~64 per arm at 80% power; a within-subject design with correlated measures needs fewer. Treat these as planning inputs, not fixed rules.
- **Measures:** task success, time on task, errors, clicks, scroll depth, SUS, SEQ, NASA-TLX, preference; accessibility measures separately.
- **Guardrails:** support contacts, abandonment, calendar edit errors, accidental state changes.
- **Analysis:** mixed-effects model with participant as a random effect; report effect sizes and confidence intervals, not only p-values.

### 11.4 Accessibility audit

- WCAG 2.2 AA: 1.4.10 reflow at 320 px, 2.4.11 focus not obscured, 2.5.8 target size, 2.4.7 focus visible, 2.4.13 focus appearance, 1.4.3 contrast, 3.2.6 consistent help where relevant [1].
- Keyboard-only: tab order with the drawer/sheet open; Escape; focus return; no keyboard trap.
- Screen readers: NVDA + Firefox and VoiceOver + Safari; dock tabs, page segmented controls, badges, live log, close/minimize.
- Zoom: 200% text, 400% page, 320 px width, landscape phone.
- Internationalisation: en, zh-HK, pseudo-locale; RTL if added.

### 11.5 Analytics and ethics

- Event taxonomy and dashboards should answer “which layout helps which job”, not “how many clicks”.
- Do not send health details, chat text or state notes to analytics; aggregate and anonymise.
- Obtain consent for sessions; allow deletion; follow the product’s privacy posture.

---

## 12. Limitations

- **Secondary research only.** No primary user data were collected for this report; the audit is heuristic.
- **Design-system guidance is consensus, not controlled evidence.** Material, Apple, Fluent, Carbon and GOV.UK encode platform conventions and research, but they are not experiments on POC3’s users.
- **Split-attention evidence comes from learning.** The Sweller/Chandler work is about instructional materials, not web dashboards; its transfer to UI layout is an analogy, not a proof.
- **NN/g articles are expert synthesis.** They are widely used and often grounded in eyetracking, but they are not a substitute for a local study.
- **WCAG is accessibility, not usability.** Conformance does not prove the layout is efficient or pleasant; it only removes known barriers.
- **AI assistant pattern evidence is thin.** The side-panel pattern is industry practice [41][42], not a body of controlled studies; the HAX guidelines are the strongest available synthesis [39][40].
- **English-language sources.** The zh-HK UI is supported in the product but not separately studied here.
- **Measurements are from one seeded dataset.** The page heights and overlap figures are real for the captured states, not universal constants.

---

## 13. Conclusion

The evidence supports the **layout grammar** POC3 shipped: group by job, keep primary content visible, use tabs for a few mutually exclusive sections, use side-by-side only for peer content that must be referenced together, and keep persistent assistance non-modal. The measured reductions are real and in the expected direction.

The remaining work is not “more regrouping”. It is:

1. **Accessibility correctness** — inert/focus management for the narrow-width overlay, disclosure semantics on the launcher, and a deliberate choice between ARIA tabs and segmented-control semantics.
2. **Discoverability of safety-relevant information** — a visible load signal on the history page, a head action for setting a state, and URL-addressable tabs.
3. **Evidence** — a task-based study and an accessibility audit that test the hypotheses in §11 rather than relying on the pattern literature alone.

The best layout is the one that keeps the runner’s primary job visible and makes the secondary job cheap to reach. The current design is close; the next gains come from semantics, focus and measurement, not from adding another tab.

---

## References

All URLs accessed 2026-11-20. Evidence tier in brackets.

1. [W3C, *Web Content Accessibility Guidelines (WCAG) 2.2*, W3C Recommendation, 12 December 2024](https://www.w3.org/TR/WCAG22/) — [Normative]
2. [W3C WAI, *ARIA Authoring Practices Guide: Tabs Pattern*](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) — [Normative]
3. [W3C WAI, *Understanding SC 1.4.10: Reflow*](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) — [Normative guidance]
4. [W3C WAI, *Understanding SC 2.4.11: Focus Not Obscured (Minimum)*](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) — [Normative guidance]
5. [W3C WAI, *Understanding SC 2.5.8: Target Size (Minimum)*](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — [Normative guidance]
6. [Evan Sunwall, *Tabs, Used Right*, Nielsen Norman Group, 2 August 2024](https://www.nngroup.com/articles/tabs-used-right/) — [Expert synthesis]
7. [Jakob Nielsen, *Progressive Disclosure*, Nielsen Norman Group, 3 December 2006](https://www.nngroup.com/articles/progressive-disclosure/) — [Expert synthesis]
8. [Therese Fessenden, *Modal & Nonmodal Dialogs: When (& When Not) to Use Them*, Nielsen Norman Group, 23 April 2017](https://www.nngroup.com/articles/modal-nonmodal-dialog/) — [Expert synthesis]
9. [Hoa Loranger, *Accordions Are Not Always the Answer for Complex Content on Desktops*, Nielsen Norman Group, 18 May 2014](https://www.nngroup.com/articles/accordions-complex-content/) — [Expert synthesis]
10. [Raluca Budiu, *Memory Recognition and Recall in User Interfaces*, Nielsen Norman Group, 15 January 2024](https://www.nngroup.com/articles/recognition-and-recall/) — [Expert synthesis]
11. [Raluca Budiu, *Interaction Cost: Definition*, Nielsen Norman Group, 31 August 2013, reviewed 14 October 2024](https://www.nngroup.com/articles/interaction-cost-definition/) — [Expert synthesis]
12. [Kathryn Whitenton, *Minimize Cognitive Load to Maximize Usability*, Nielsen Norman Group, 22 December 2013](https://www.nngroup.com/articles/minimize-cognitive-load/) — [Expert synthesis]
13. [Kate Moran, *How Chunking Helps Content Processing*, Nielsen Norman Group, 20 March 2016](https://www.nngroup.com/articles/chunking/) — [Expert synthesis]
14. [Kelley Gordon, *Visual Hierarchy in UX: Definition*, Nielsen Norman Group, 17 January 2021](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) — [Expert synthesis]
15. [Jakob Nielsen, *10 Usability Heuristics for User Interface Design*, Nielsen Norman Group, 24 April 1994, reviewed 30 January 2024](https://www.nngroup.com/articles/ten-usability-heuristics/) — [Expert synthesis]
16. [GOV.UK Design System, *Tabs*](https://design-system.service.gov.uk/components/tabs/) — [Design-system guidance]
17. [Carbon Design System, *Tabs*](https://www.carbondesignsystem.com/building-blocks/core/components/tabs) — [Design-system guidance]
18. [Microsoft Fluent 2, *React Tablist — Usage*](https://fluent2.microsoft.design/components/web/react/core/tablist/usage) — [Design-system guidance]
19. [Material Design 3, *Tabs*](https://m3.material.io/components/tabs/overview) — [Design-system guidance]
20. [Material Design 3, *Navigation drawer — Guidelines*](https://m3.material.io/components/navigation-drawer/guidelines) — [Design-system guidance]
21. [Material Design 3, *Side sheets*](https://m3.material.io/components/side-sheets/overview) — [Design-system guidance]
22. [Material Design 3, *Navigation rail*](https://m3.material.io/components/navigation-rail/overview) — [Design-system guidance]
23. [Material Design 3, *Breakpoints*](https://m3.material.io/foundations/layout/breakpoints) — [Design-system guidance]
24. [Material Design 3, *Canonical layouts*](https://m3.material.io/foundations/adaptive-design/canonical-layouts) — [Design-system guidance]
25. [SAP Fiori for Android, *Window Size Classes* (summary of Material 3 classes)](https://www.sap.com/design-system/fiori-design-android/v24-12/foundations/adaptive-layout/window-size-classes) — [Design-system guidance]
26. [Apple Human Interface Guidelines, *Tab bars*](https://developer.apple.com/design/human-interface-guidelines/tab-bars) — [Design-system guidance]
27. [Apple Human Interface Guidelines, *Sidebars*](https://developer.apple.com/design/human-interface-guidelines/sidebars) — [Design-system guidance]
28. [Apple Human Interface Guidelines, *Split views*](https://developer.apple.com/design/human-interface-guidelines/split-views) — [Design-system guidance]
29. [Apple Human Interface Guidelines, *Sheets*](https://developer.apple.com/design/human-interface-guidelines/sheets) — [Design-system guidance]
30. [Apple Human Interface Guidelines, *Segmented controls*](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) — [Design-system guidance]
31. [Apple Human Interface Guidelines, *Modality*](https://developer.apple.com/design/human-interface-guidelines/modality) — [Design-system guidance]
32. [Jon Yablonski, *Hick's Law*, Laws of UX](https://lawsofux.com/hicks-law/) — [Expert synthesis / empirical origin]
33. [Jon Yablonski, *Miller's Law*, Laws of UX](https://lawsofux.com/millers-law/) — [Expert synthesis / empirical origin]
34. [Jon Yablonski, *Law of Proximity*, Laws of UX](https://lawsofux.com/law-of-proximity/) — [Expert synthesis / Gestalt]
35. [Jon Yablonski, *Law of Common Region*, Laws of UX](https://lawsofux.com/law-of-common-region/) — [Expert synthesis / Gestalt]
36. [Jon Yablonski, *Fitts's Law*, Laws of UX](https://lawsofux.com/fittss-law/) — [Expert synthesis / empirical origin]
37. [Matthew Butterick, *Line length*, Butterick's Practical Typography](https://practicaltypography.com/line-length.html) — [Expert synthesis]
38. [Wikipedia, *Split attention effect* (summarising Sweller, Chandler and colleagues)](https://en.wikipedia.org/wiki/Split_attention_effect) — [Secondary; primary sources cited there]
39. [Microsoft HAX Toolkit, *Guidelines for Human-AI Interaction*](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) — [Evidence-based synthesis]
40. [Microsoft HAX Toolkit, *HAX Design Library: 18 Guidelines*](https://www.microsoft.com/en-us/haxtoolkit/library/) — [Evidence-based synthesis]
41. [assistant-ui, *Assistant sidebar*](https://www.assistant-ui.com/elements/assistant-sidebar) — [Practitioner pattern]
42. [Kraftbase, *AI Copilot UX Patterns: 7 Interface Patterns That Make Assistants Useful*](https://www.kraftbase.com/blog/ai-copilot-ux-patterns) — [Practitioner pattern]
43. [Google PAIR, *People + AI Guidebook*](https://pair.withgoogle.com/guidebook) — [Practitioner guidance]

---

## Appendix A — POC3 measurements used in the audit

Source: [the layout review](13-layout-review.md), headless-Chrome captures at 1280×900, 1024×768 and 390×844.

| Surface | Before | After | Note |
|---|---|---|---|
| Coach overlay / dock | 242,572 px² covered | 0 px² covered | 380 px fixed panel → 340 px docked column at ≥1200 px |
| Main column | 1,080 px | 904 px | 1280 px viewport |
| Month card | 1,002 px | 826 px at 1280; ≈988 px at 1440 | The dock takes width; the calendar remains usable |
| Chat log | 640 px | 493 px | Within the dock |
| Training log | 2,198 px desktop; 2,585 CSS px phone | 1,547 px; 1,765 CSS px | Days/Review tabs |
| Coaching states | 1,722 px | 1,231 px current; 900 px set/history | Current/Set/History tabs |
| Activity detail | 2,233 px | 1,647 px | Two columns; 554 / 472 px at 1280 |
| Muscle | Figure below the fold | Figure above the fold at 1280 | Full page 2,930 px |
| Verification | — | Full suite green; 34 captures; 0 JS exceptions | `app.css?v=27`, live `:8093` / `:8092` |

## Appendix B — Audit checklist for the next pass

- [ ] Keyboard-only: open/close the drawer and sheet at 1024 and 390 px; no focus behind the overlay; Escape returns to the launcher.
- [ ] Screen reader: dock tabs announce tab/panel; page segmented controls announce the group and the selected view; badges and live log are announced once, not repeatedly.
- [ ] 320 px width: no horizontal scroll; tab strip wraps without clipping; close and tab targets ≥24 px (preferably 44 px on phone).
- [ ] 200% text and 400% zoom: no obscured focus; no two-dimensional page scrolling; sticky dock does not cover focused controls.
- [ ] Long-label pseudo-locale: tab strip wraps or truncates with an accessible name, not overflow.
- [ ] URL/deep links: `?tab=review`, `?tab=set`, `?tab=history` restore the panel; back/forward behave.
- [ ] Load summary visible without opening Review; the chip links to Review.
- [ ] Analytics: tab switches, time to first action, scroll depth, task success, abandonment.
