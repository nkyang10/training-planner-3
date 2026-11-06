/**
 * The private calendar: the artefact the conversation leaves behind. Read-only for the runner; the coach (gateway)
 * books future sessions, Garmin completes them. There is no manual edit path in POC3 (ADR-0001).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AuthError, type Auth, type AuthUser, type ProfileUpdate } from "./auth";
import type { GarminClient } from "./garmin";
import { mapGarminActivity } from "./garmin";
import { CSS } from "./styles";
import type { Activity, Store, TrainingSession } from "./types";

export interface WebOptions {
  store: Store;
  auth: Auth;
  /** The coach gateway; the embedded bubble talks through this server so the browser stays same-origin. */
  gatewayUrl?: string;
  modelId?: string;
  garmin?: GarminClient;
  now?: () => string;
}

export interface WebApp {
  server: ReturnType<typeof createServer>;
  close(): Promise<void>;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(html);
}

function redirect(response: ServerResponse, location: string, headers: Record<string, string> = {}): void {
  response.writeHead(303, { location, ...headers });
  response.end();
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 200_000) throw new Error("request too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text.length === 0 ? undefined : (JSON.parse(text) as unknown);
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 200_000) throw new Error("request too large");
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(month: string): string {
  return `${month}-01`;
}

function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2026, mon ?? 1, 0)).getUTCDate();
}

function weekdayIndex(day: string): number {
  return (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

function sessionChip(session: TrainingSession): string {
  const amount = session.distanceKm === null ? "" : ` · ${session.distanceKm} km`;
  return `<span class="session kind-${escapeHtml(session.kind)}" title="${escapeHtml(session.note ?? session.title)}">${escapeHtml(session.title)}${escapeHtml(amount)}</span>`;
}

function activityLine(activity: Activity): string {
  const amount = [activity.distanceKm === null ? "" : `${activity.distanceKm} km`, activity.durationMin === null ? "" : `${activity.durationMin} min`, activity.paceSecPerKm === null ? "" : `${Math.floor(activity.paceSecPerKm / 60)}:${String(activity.paceSecPerKm % 60).padStart(2, "0")}/km`, activity.avgHr === null ? "" : `${activity.avgHr} bpm`]
    .filter((part) => part.length > 0)
    .join(" · ");
  return `<li><span class="tick">✓</span> ${escapeHtml(activity.title)}${amount.length === 0 ? "" : ` — ${escapeHtml(amount)}`} <span class="muted">(${escapeHtml(activity.source)})</span></li>`;
}

function errorBanner(error?: string): string {
  return error === undefined ? "" : `<p class="error" role="alert">${escapeHtml(error)}</p>`;
}

function layout(title: string, body: string, user: AuthUser | undefined): string {
  const nav = user === undefined
    ? `<nav class="top"><span class="brand">⚡ AI COACH CALENDAR</span><a class="profile" href="/login">Sign in</a><a href="/signup">Sign up</a></nav>`
    : `<nav class="top"><a class="brand" href="/calendar">⚡ AI COACH CALENDAR</a><a class="profile" href="/profile">${escapeHtml(user.displayName)}</a><a href="/logout">Sign out</a></nav>`;
  const bubble = user === undefined ? "" : renderChatBubble();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title><link rel="stylesheet" href="/static/app.css"></head>
  <body>${nav}<main>${body}</main>${bubble}</body></html>`;
}

/** The in-calendar coach bubble: suggestions are tappable; undo is requested in chat, with no history panel. */
function renderChatBubble(): string {
  return `<button id="coach-bubble" type="button" aria-label="Talk to the coach">💬 Coach</button>
  <section id="coach-panel" hidden aria-label="Coach chat">
    <header><strong>AI Coach</strong><button id="coach-close" type="button" aria-label="Close chat">×</button></header>
    <div id="coach-log" role="log" aria-live="polite"></div>
    <div id="coach-suggestions" aria-label="Suggested next messages"></div>
    <form id="coach-form"><textarea id="coach-input" rows="2" maxlength="1000" required placeholder="Tell the coach about your training…"></textarea><button class="btn" type="submit">Send</button></form>
  </section>
  <script>
  (() => {
    const bubble = document.getElementById('coach-bubble');
    const panel = document.getElementById('coach-panel');
    const close = document.getElementById('coach-close');
    const form = document.getElementById('coach-form');
    const input = document.getElementById('coach-input');
    const log = document.getElementById('coach-log');
    const suggestions = document.getElementById('coach-suggestions');
    if (!bubble || !panel || !close || !form || !input || !log || !suggestions) return;
    const show = () => { panel.hidden = false; bubble.hidden = true; input.focus(); void loadConversation(); };
    const hide = () => { panel.hidden = true; bubble.hidden = false; };
    const scrollToLatest = () => {
      requestAnimationFrame(() => {
        log.scrollTop = log.scrollHeight;
      });
    };
    const add = (role, text) => {
      const line = document.createElement('div');
      line.className = 'bubble ' + role;
      line.textContent = text;
      log.appendChild(line);
      scrollToLatest();
      return line;
    };
    let historyLoaded = false;
    const loadConversation = async () => {
      if (historyLoaded) return;
      historyLoaded = true;
      try {
        const response = await fetch('/chat/history');
        if (!response.ok) return;
        const data = await response.json();
        if (log.childElementCount > 0) return;
        for (const message of data.messages || []) {
          if (message.role === 'user' || message.role === 'assistant') {
            add(message.role === 'user' ? 'user' : 'coach', String(message.text || ''));
          }
        }
      } catch {
        // A failed history read leaves the bubble empty; the next turn still works.
      }
    };
    const monthGrid = document.querySelector('.month[data-month]');
    const refreshCalendar = async () => {
      if (!monthGrid) return;
      const month = monthGrid.getAttribute('data-month');
      if (!month) return;
      try {
        const response = await fetch('/calendar/data?month=' + encodeURIComponent(month));
        if (!response.ok) return;
        const data = await response.json();
        for (const [day, info] of Object.entries(data.days || {})) {
          const cell = document.querySelector('.cell[data-day="' + day + '"]');
          if (!cell) continue;
          cell.querySelectorAll('.session, .done').forEach((node) => node.remove());
          for (const session of info.sessions || []) {
            const chip = document.createElement('span');
            chip.className = 'session kind-' + session.kind;
            chip.textContent = session.title + (session.distanceKm == null ? '' : ' · ' + session.distanceKm + ' km');
            cell.appendChild(chip);
          }
          if (info.activities > 0) {
            const done = document.createElement('span');
            done.className = 'done';
            done.textContent = '✓ ' + info.activities;
            cell.appendChild(done);
          }
        }
      } catch {
        // A failed refresh leaves the page as it was; the booking itself is already stored.
      }
    };
    const rectOf = (day) => {
      const cell = document.querySelector('.cell[data-day="' + day + '"]');
      return cell ? cell.getBoundingClientRect() : null;
    };
    const animateChanges = async (changes) => {
      if (!Array.isArray(changes) || changes.length === 0) return;
      const before = changes.map((change) => ({ change, from: change.fromDay ? rectOf(change.fromDay) : null }));
      await refreshCalendar();
      const overlay = document.createElement('div');
      overlay.id = 'calendar-fx';
      overlay.className = 'active';
      const trash = document.createElement('div');
      trash.className = 'fx-trash';
      trash.textContent = '🗑';
      document.body.appendChild(overlay);
      document.body.appendChild(trash);
      document.body.classList.add('calendar-fx-active');
      for (const [index, item] of before.entries()) {
        setTimeout(() => {
        const change = item.change;
        const to = change.toDay ? rectOf(change.toDay) : null;
        const start = item.from || to;
        if (!start) return;
        const ghost = document.createElement('span');
        ghost.className = 'fx-ghost session kind-' + change.kind;
        ghost.textContent = change.title || change.kind;
        ghost.style.left = start.left + 'px';
        ghost.style.top = start.top + 'px';
        ghost.style.width = start.width + 'px';
        document.body.appendChild(ghost);
        const end = change.action === 'remove' ? { left: innerWidth / 2, top: innerHeight - 70 } : (to || start);
        const dx = end.left - start.left;
        const dy = end.top - start.top;
        const frames = [
          { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + dx * 0.5 + 'px, ' + (dy * 0.5 - 90) + 'px) scale(1.9) rotate(-9deg)', opacity: 1, offset: 0.55 },
          { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + (change.action === 'remove' ? 0.15 : 1) + ') rotate(9deg)', opacity: change.action === 'remove' ? 0 : 1 },
        ];
        if (ghost.animate) {
          ghost.animate(frames, { duration: 950, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => ghost.remove();
        } else {
          ghost.remove();
        }
        if (change.action === 'remove') {
          trash.classList.add('pop');
          if (navigator.vibrate) navigator.vibrate(60);
        }
        const pulseDay = change.action === 'remove' ? change.fromDay : change.toDay;
        const target = pulseDay ? document.querySelector('.cell[data-day="' + pulseDay + '"]') : null;
        if (target) {
          target.classList.add(change.action === 'remove' ? 'fx-delete' : 'fx-land');
          setTimeout(() => target.classList.remove('fx-delete', 'fx-land'), 1300);
        }
        }, index * 140);
      }
      setTimeout(() => {
        overlay.remove();
        trash.remove();
        document.body.classList.remove('calendar-fx-active');
      }, 1200 + before.length * 140);
    };
    const setSuggestions = (items) => {
      suggestions.replaceChildren();
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const text = typeof item === 'string' ? item.trim() : '';
        if (text.length === 0) continue;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion';
        chip.textContent = text;
        chip.addEventListener('click', () => { void send(text); });
        suggestions.appendChild(chip);
      }
    };
    const send = async (raw) => {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text.length === 0) return;
      add('user', text);
      if (input.value.trim() === text) input.value = '';
      const typing = add('coach', '…');
      typing.classList.add('typing');
      try {
        const response = await fetch('/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text }) });
        const data = await response.json();
        typing.remove();
        if (!response.ok) {
          add('error', data && data.error ? data.error.detail : 'The coach could not answer.');
          return;
        }
        add('coach', data.reply);
        setSuggestions(data.suggestions);
        scrollToLatest();
        if (data.sessions > 0 || (Array.isArray(data.changes) && data.changes.length > 0)) {
          await animateChanges(data.changes || []);
          add('system', 'Calendar updated · 日曆已更新');
        }
      } catch {
        typing.remove();
        add('error', 'Network error. Try again.');
      }
    };
    bubble.addEventListener('click', show);
    close.addEventListener('click', hide);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (text.length === 0) return;
      input.value = '';
      void send(text);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
    });
  })();
  </script>`;
}

function renderLogin(error?: string): string {
  return layout(
    "Sign in",
    `<section class="card narrow"><h1>Sign in</h1>
      <p class="muted">Your private training calendar, booked by your AI coach.</p>
      ${errorBanner(error)}
      <form method="post" action="/login" class="stack">
        <label for="username">Username</label><input id="username" name="username" required autocomplete="username" minlength="3" maxlength="24">
        <label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password" minlength="8">
        <button class="btn" type="submit">Sign in</button>
      </form>
      <p class="muted small">New here? <a href="/signup">Create an account</a></p>
    </section>`,
    undefined,
  );
}

function renderSignup(error?: string): string {
  return layout(
    "Create an account",
    `<section class="card narrow"><h1>Create an account</h1>
      <p class="muted">A private calendar for your training, kept by your AI coach.</p>
      ${errorBanner(error)}
      <form method="post" action="/signup" class="stack">
        <label for="username">Username</label><input id="username" name="username" required autocomplete="username" minlength="3" maxlength="24" pattern="[a-z0-9_]{3,24}">
        <label for="displayName">Display name</label><input id="displayName" name="displayName" required autocomplete="name" maxlength="60">
        <label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="new-password" minlength="8">
        <label for="timezone">Timezone</label><input id="timezone" name="timezone" value="Asia/Hong_Kong" required autocomplete="off">
        <label for="goal">Training goal <span class="muted small">(optional)</span></label><input id="goal" name="goal" maxlength="120" autocomplete="off">
        <button class="btn" type="submit">Create account</button>
      </form>
      <p class="muted small">Already have an account? <a href="/login">Sign in</a></p>
    </section>`,
    undefined,
  );
}

function renderProfile(user: AuthUser, saved: boolean, error?: string): string {
  return layout(
    "Profile",
    `<section class="card narrow"><h1>Your profile</h1>
      <p class="muted">Signed in as <strong>${escapeHtml(user.username)}</strong>.</p>
      ${saved ? `<p class="ok" role="status">Profile saved.</p>` : ""}
      ${errorBanner(error)}
      <form method="post" action="/profile" class="stack">
        <label for="username">Username</label><input id="username" value="${escapeHtml(user.username)}" readonly>
        <label for="displayName">Display name</label><input id="displayName" name="displayName" value="${escapeHtml(user.displayName)}" required maxlength="60" autocomplete="name">
        <label for="timezone">Timezone</label><input id="timezone" name="timezone" value="${escapeHtml(user.timezone)}" required autocomplete="off">
        <label for="goal">Training goal <span class="muted small">(optional)</span></label><input id="goal" name="goal" value="${escapeHtml(user.goal ?? "")}" maxlength="120" autocomplete="off">
        <label for="password">New password <span class="muted small">(leave blank to keep it)</span></label><input id="password" name="password" type="password" minlength="8" autocomplete="new-password">
        <button class="btn" type="submit">Save profile</button>
      </form>
      <p class="muted small">Member since ${escapeHtml(user.createdAt.slice(0, 10))}.</p>
    </section>`,
    user,
  );
}

export function createWeb(options: WebOptions): WebApp {
  const now = options.now ?? (() => new Date().toISOString());
  const server = createServer((request, response) => {
    let requestUser: AuthUser | undefined;
    void (async (): Promise<void> => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const method = request.method ?? "GET";

      if (url.pathname === "/static/app.css") {
        response.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300" });
        response.end(CSS);
        return;
      }
      if (url.pathname === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
        return;
      }

      requestUser = options.auth.read(request);

      if (url.pathname === "/login") {
        if (method === "GET") {
          if (requestUser !== undefined) {
            redirect(response, "/calendar");
            return;
          }
          sendHtml(response, 200, renderLogin(url.searchParams.get("error") ?? undefined));
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          try {
            const result = options.auth.login({
              username: form.get("username") ?? "",
              password: form.get("password") ?? "",
            });
            redirect(response, "/calendar", { "set-cookie": result.cookie });
          } catch (error) {
            const message = error instanceof AuthError ? error.message : "Could not sign in";
            redirect(response, "/login?error=" + encodeURIComponent(message));
          }
          return;
        }
        sendHtml(response, 405, layout("Method not allowed", `<p>Method not allowed</p>`, requestUser));
        return;
      }

      if (url.pathname === "/signup") {
        if (method === "GET") {
          if (requestUser !== undefined) {
            redirect(response, "/calendar");
            return;
          }
          sendHtml(response, 200, renderSignup(url.searchParams.get("error") ?? undefined));
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          try {
            const result = options.auth.signup({
              username: form.get("username") ?? "",
              displayName: form.get("displayName") ?? "",
              password: form.get("password") ?? "",
              timezone: (form.get("timezone") ?? "").trim() || "Asia/Hong_Kong",
              goal: form.get("goal"),
            });
            redirect(response, "/calendar", { "set-cookie": result.cookie });
          } catch (error) {
            const message = error instanceof AuthError ? error.message : "Could not create the account";
            redirect(response, "/signup?error=" + encodeURIComponent(message));
          }
          return;
        }
        sendHtml(response, 405, layout("Method not allowed", `<p>Method not allowed</p>`, requestUser));
        return;
      }

      if (url.pathname === "/logout") {
        if (method === "GET") {
          redirect(response, "/login", { "set-cookie": options.auth.clearCookie() });
          return;
        }
        sendHtml(response, 405, layout("Method not allowed", `<p>Method not allowed</p>`, requestUser));
        return;
      }

      if (requestUser === undefined) {
        redirect(response, "/login");
        return;
      }
      const user = requestUser;
      const today = now().slice(0, 10);

      if (url.pathname === "/profile") {
        if (method === "GET") {
          sendHtml(
            response,
            200,
            renderProfile(user, url.searchParams.get("saved") === "1", url.searchParams.get("error") ?? undefined),
          );
          return;
        }
        if (method === "POST") {
          const form = await readForm(request);
          const password = form.get("password") ?? "";
          const patch: ProfileUpdate = {};
          if (form.has("displayName")) patch.displayName = form.get("displayName") ?? "";
          if (form.has("timezone")) patch.timezone = form.get("timezone") ?? "";
          if (form.has("goal")) patch.goal = form.get("goal");
          if (password.length > 0) patch.password = password;
          try {
            options.auth.updateProfile(user.userId, patch);
            redirect(response, "/profile?saved=1");
          } catch (error) {
            const message = error instanceof AuthError ? error.message : "Could not save the profile";
            redirect(response, "/profile?error=" + encodeURIComponent(message));
          }
          return;
        }
        sendHtml(response, 405, layout("Method not allowed", `<p>Method not allowed</p>`, user));
        return;
      }

      if (url.pathname === "/chat" && method === "POST") {
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "invalid body" } }));
          return;
        }
        const message = typeof body === "object" && body !== null && typeof (body as Record<string, unknown>)["message"] === "string"
          ? String((body as Record<string, unknown>)["message"]).trim()
          : "";
        if (message.length === 0 || message.length > 1000) {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "message must be 1..1000 characters" } }));
          return;
        }
        const gatewayUrl = (options.gatewayUrl ?? "http://127.0.0.1:8090").replace(/\/$/, "");
        try {
          const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-poc3-user": user.userId },
            body: JSON.stringify({ model: options.modelId ?? "poc3-coach", stream: false, messages: [{ role: "user", content: message }] }),
          });
          const payload = (await upstream.json()) as {
            choices?: Array<{ message?: { content?: unknown } }>;
            poc3?: {
              sessions?: number;
              memories?: number;
              changes?: unknown[];
              changeSetId?: string | null;
              reverted?: boolean;
              suggestions?: unknown[];
            };
            error?: { detail?: string };
          };
          const reply = payload.choices?.[0]?.message?.content;
          if (!upstream.ok || typeof reply !== "string") {
            response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: { detail: payload.error?.detail ?? `coach answered ${upstream.status}` } }));
            return;
          }
          const suggestions = Array.isArray(payload.poc3?.suggestions)
            ? payload.poc3.suggestions.filter((suggestion): suggestion is string => typeof suggestion === "string")
            : [];
          response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          response.end(JSON.stringify({
            reply,
            sessions: payload.poc3?.sessions ?? 0,
            changes: payload.poc3?.changes ?? [],
            suggestions,
            changeSetId: payload.poc3?.changeSetId ?? null,
            reverted: payload.poc3?.reverted === true,
            memories: payload.poc3?.memories ?? 0,
          }));
        } catch (error) {
          response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: error instanceof Error ? error.message : String(error) } }));
        }
        return;
      }

      if (url.pathname === "/chat/history" && method === "GET") {
        const messages = options.store.listMessages(user.userId, 40).map((message) => ({
          role: message.role,
          text: message.text,
          createdAt: message.createdAt,
        }));
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ messages }));
        return;
      }

      if (url.pathname === "/calendar/data" && method === "GET") {
        const month = url.searchParams.get("month") ?? today.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: { detail: "month must be YYYY-MM" } }));
          return;
        }
        const start = monthStart(month);
        const end = addDays(start, daysInMonth(month) - 1);
        const sessions = options.store.listSessions(user.userId, start, end);
        const activities = options.store.listActivities(user.userId, 500).filter((activity) => activity.day >= start && activity.day <= end);
        const days: Record<string, { sessions: Array<{ title: string; kind: string; distanceKm: number | null }>; activities: number }> = {};
        for (const session of sessions) {
          const entry = (days[session.day] ??= { sessions: [], activities: 0 });
          entry.sessions.push({ title: session.title, kind: session.kind, distanceKm: session.distanceKm });
        }
        for (const activity of activities) {
          const entry = (days[activity.day] ??= { sessions: [], activities: 0 });
          entry.activities += 1;
        }
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ month, days }));
        return;
      }

      if (url.pathname === "/" || url.pathname === "/calendar") {
        const month = url.searchParams.get("month") ?? today.slice(0, 7);
        const start = monthStart(month);
        const end = addDays(start, daysInMonth(month) - 1);
        const sessions = options.store.listSessions(user.userId, start, end);
        const activities = options.store.listActivities(user.userId, 200).filter((activity) => activity.day >= start && activity.day <= end);
        const firstWeekday = weekdayIndex(start);
        const cells: string[] = [];
        for (let pad = 0; pad < firstWeekday; pad += 1) cells.push(`<div class="cell pad"></div>`);
        for (let dayNumber = 1; dayNumber <= daysInMonth(month); dayNumber += 1) {
          const day = `${month}-${String(dayNumber).padStart(2, "0")}`;
          const daySessions = sessions.filter((session) => session.day === day);
          const dayActivities = activities.filter((activity) => activity.day === day);
          cells.push(`<a class="cell${day === today ? " today" : ""}" data-day="${escapeHtml(day)}" href="/day/${escapeHtml(day)}">
            <span class="date">${dayNumber}</span>
            ${daySessions.map(sessionChip).join("")}
            ${dayActivities.length === 0 ? "" : `<span class="done">✓ ${dayActivities.length}</span>`}
          </a>`);
        }
        const prev = addDays(start, -1).slice(0, 7);
        const next = addDays(end, 1).slice(0, 7);
        const synced = url.searchParams.get("synced");
        const syncError = url.searchParams.get("syncError");
        const body = `<header class="page-head"><p class="eyebrow">Private calendar</p><h1>${MONTHS[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}</h1>
          <p class="muted">Welcome back, ${escapeHtml(user.displayName)}. Sessions booked by your AI coach. Activities come from Garmin.</p></header>
          <section class="card">
            <div class="month-nav"><a href="/calendar?month=${escapeHtml(prev)}">← Previous</a><a href="/calendar?month=${escapeHtml(today.slice(0, 7))}">This month</a><a href="/calendar?month=${escapeHtml(next)}">Next →</a></div>
            ${synced === null ? "" : `<p class="ok" role="status">Garmin sync: ${escapeHtml(synced)} imported</p>`}
            ${syncError === null ? "" : `<p class="error" role="alert">Garmin sync failed: ${escapeHtml(syncError)}</p>`}
            <div class="dow">${DOW.map((day) => `<span>${day}</span>`).join("")}</div>
            <div class="month" data-month="${escapeHtml(month)}">${cells.join("")}</div>
            <form method="post" action="/sync" class="stack"><button class="btn" type="submit"${options.garmin === undefined ? " disabled" : ""}>Sync Garmin</button>${options.garmin === undefined ? `<span class="muted small">GARMIN_PERSONAL_API_KEY is not set</span>` : ""}</form>
          </section>`;
        sendHtml(response, 200, layout("Calendar", body, user));
        return;
      }

      if (url.pathname.startsWith("/day/")) {
        const day = url.pathname.slice("/day/".length);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          sendHtml(response, 404, layout("Not found", `<p>Not found</p>`, user));
          return;
        }
        const sessions = options.store.listSessions(user.userId, day, day);
        const activities = options.store.listActivities(user.userId, 200).filter((activity) => activity.day === day);
        const body = `<header class="page-head"><p class="eyebrow"><a href="/calendar?month=${escapeHtml(day.slice(0, 7))}">← Calendar</a></p><h1>${escapeHtml(day)}</h1>
          <p class="muted">${escapeHtml(user.displayName)} · <a href="/profile">Profile</a></p></header>
          <section class="card"><h2>Booked by the coach</h2>${sessions.length === 0 ? `<p class="muted">No session booked.</p>` : `<ul class="sessions">${sessions.map((session) => `<li><strong>${escapeHtml(session.title)}</strong> <span class="chip kind-${escapeHtml(session.kind)}">${escapeHtml(session.kind)}</span>${session.distanceKm === null ? "" : ` · ${session.distanceKm} km`}${session.durationMin === null ? "" : ` · ${session.durationMin} min`}${session.note === null ? "" : `<p class="note">${escapeHtml(session.note)}</p>`}</li>`).join("")}</ul>`}</section>
          <section class="card"><h2>Done (Garmin / reported)</h2>${activities.length === 0 ? `<p class="muted">Nothing recorded yet.</p>` : `<ul class="sessions">${activities.map(activityLine).join("")}</ul>`}</section>`;
        sendHtml(response, 200, layout(day, body, user));
        return;
      }

      if (url.pathname === "/sync" && method === "POST") {
        if (options.garmin === undefined) {
          redirect(response, "/calendar?syncError=" + encodeURIComponent("Garmin is not configured"));
          return;
        }
        try {
          const raw = await options.garmin.listActivities(30);
          let imported = 0;
          for (const item of raw) {
            const mapped = mapGarminActivity(item, user.userId);
            if (mapped !== undefined) {
              options.store.appendActivity(mapped);
              imported += 1;
            }
          }
          redirect(response, `/calendar?synced=${imported}`);
        } catch (error) {
          redirect(response, "/calendar?syncError=" + encodeURIComponent(error instanceof Error ? error.message : String(error)));
        }
        return;
      }

      sendHtml(response, 404, layout("Not found", `<p>Not found</p>`, user));
    })().catch((error: unknown) => {
      if (!response.headersSent) sendHtml(response, 500, layout("Error", `<p class="error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`, requestUser));
      else response.end();
    });
  });
  return { server, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
