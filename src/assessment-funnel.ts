/**
 * Assessment funnel: quiz, complete, paywall, report.
 * Paywall starts Stripe Checkout (Worker). Report unlocks from Supabase subscriptions (or legacy local flag).
 */

import { createClient } from "@supabase/supabase-js";
import { startSubscriptionCheckout } from "./checkout-start";
import { resolveSupabaseConfig } from "./supabase-env";

const STORAGE_ANSWERS = "assessment_answers";
const STORAGE_RISKS = "assessment_flagged_risks";
const STORAGE_SUBSCRIBED = "assessment_subscribed";
const STORAGE_PASSIONS = "assessment_kid_passions";
const TOPICS_API = "/.netlify/functions/topics-for-interest";

type QuestionOption = { value: string; label: string };
type Question = {
  id: string;
  text: string;
  options: QuestionOption[];
  riskWhen: string[];
  risks: string[];
};

function getQuestions(): Question[] {
  const el = document.getElementById("assessment-questions-data");
  if (!el?.textContent) return [];
  try {
    return JSON.parse(el.textContent) as Question[];
  } catch {
    return [];
  }
}

type ArticleForReport = { slug: string; title: string; excerpt: string; section?: string; labels?: string[] };

type TopicItem = { title: string; description: string; url: string; conversationStarter: string };
type TopicsResponse = { topics: TopicItem[]; error?: string };

function getArticles(): ArticleForReport[] {
  const el = document.getElementById("assessment-articles-data");
  if (!el?.textContent) return [];
  try {
    return JSON.parse(el.textContent) as ArticleForReport[];
  } catch {
    return [];
  }
}

function runQuiz(): void {
  const questions = getQuestions();
  if (!questions.length) return;

  const container = document.getElementById("quiz-questions-container");
  const progressBar = document.getElementById("quiz-progress-bar");
  const stepLabel = document.getElementById("quiz-step-label");
  const prevBtn = document.getElementById("quiz-prev");
  const nextBtn = document.getElementById("quiz-next");
  const submitBtn = document.getElementById("quiz-submit");
  const form = document.getElementById("quiz-form");
  const progressRole = document.getElementById("quiz-progress");

  if (!container || !form) return;

  let currentIndex = 0;
  const total = questions.length;
  const answers: Record<string, string> = JSON.parse(sessionStorage.getItem(STORAGE_ANSWERS) || "{}");

  function renderQuestion(index: number): void {
    const q = questions[index];
    if (!q || !container) return;
    const cont = container;

    cont.innerHTML = "";
    const fieldset = document.createElement("fieldset");
    fieldset.className = "space-y-3";
    fieldset.setAttribute("aria-label", `Question ${index + 1} of ${total}`);

    const legend = document.createElement("legend");
    legend.className = "text-lg font-semibold text-[#e7e9ea] mb-2 block";
    legend.textContent = q.text;
    fieldset.appendChild(legend);

    q.options.forEach((opt) => {
      const label = document.createElement("label");
      label.className = "flex items-center gap-3 py-3 px-4 rounded-lg border border-border bg-surface hover:bg-surface-hover cursor-pointer transition-colors";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = q.id;
      radio.value = opt.value;
      radio.className = "rounded-full border-border text-accent focus:ring-accent";
      if (answers[q.id] === opt.value) radio.checked = true;
      radio.addEventListener("change", () => {
        answers[q.id] = opt.value;
        sessionStorage.setItem(STORAGE_ANSWERS, JSON.stringify(answers));
      });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(opt.label));
      fieldset.appendChild(label);
    });

    cont.appendChild(fieldset);

    if (progressBar) {
      const pct = ((index + 1) / total) * 100;
      progressBar.style.width = `${pct}%`;
    }
    if (progressRole) {
      progressRole.setAttribute("aria-valuenow", String(Math.round(((index + 1) / total) * 100)));
    }
    if (stepLabel) stepLabel.textContent = `Question ${index + 1} of ${total}`;

    if (prevBtn) {
      prevBtn.style.display = index > 0 ? "inline-block" : "none";
    }
    if (nextBtn) {
      nextBtn.style.display = index < total - 1 ? "inline-block" : "none";
    }
    if (submitBtn) {
      submitBtn.style.display = index === total - 1 ? "inline-block" : "none";
    }
  }

  prevBtn?.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion(currentIndex);
    }
  });

  nextBtn?.addEventListener("click", () => {
    if (currentIndex < total - 1) {
      currentIndex++;
      renderQuestion(currentIndex);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const flagged = new Set<string>();
    questions.forEach((q) => {
      const answer = answers[q.id];
      if (q.riskWhen.includes(answer || "")) {
        q.risks.forEach((r) => flagged.add(r));
      }
    });
    sessionStorage.setItem(STORAGE_RISKS, JSON.stringify([...flagged]));
    window.location.href = "/assessment/complete/";
  });

  const savedIndex = Math.min(
    questions.findIndex((q) => !answers[q.id]),
    total - 1
  );
  if (savedIndex >= 0) currentIndex = savedIndex;
  renderQuestion(currentIndex);
}

function runPaywall(): void {
  const hint = document.getElementById("paywall-config-hint");
  const monthlyBtn = document.getElementById("paywall-monthly") as HTMLButtonElement | null;
  const yearlyBtn = document.getElementById("paywall-yearly") as HTMLButtonElement | null;
  const pm = monthlyBtn?.dataset.checkoutPrice?.trim();
  const py = yearlyBtn?.dataset.checkoutPrice?.trim();
  if (!pm || !py) {
    hint?.classList.remove("hidden");
    if (monthlyBtn) monthlyBtn.disabled = true;
    if (yearlyBtn) yearlyBtn.disabled = true;
    return;
  }
  monthlyBtn?.addEventListener("click", () => {
    void startSubscriptionCheckout(pm, {
      successPath: "/assessment/report",
      cancelPath: "/assessment/paywall",
    });
  });
  yearlyBtn?.addEventListener("click", () => {
    void startSubscriptionCheckout(py, {
      successPath: "/assessment/report",
      cancelPath: "/assessment/paywall",
    });
  });
}

async function isAssessmentSubscriber(): Promise<boolean> {
  const cfg = await resolveSupabaseConfig();
  if (!cfg?.url || !cfg?.anonKey) {
    return localStorage.getItem(STORAGE_SUBSCRIBED) === "1";
  }
  const supabase = createClient(cfg.url, cfg.anonKey);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) return false;
  const s = data?.status;
  return s === "active" || s === "trialing";
}

async function runReport(): Promise<void> {
  const paywallBlock = document.getElementById("report-paywall-block");
  const reportContent = document.getElementById("report-content");
  const reportCards = document.getElementById("report-cards");
  const subscribed = await isAssessmentSubscriber();
  const risksJson = sessionStorage.getItem(STORAGE_RISKS);
  const flaggedSlugs = risksJson ? (JSON.parse(risksJson) as string[]) : [];
  const articles = getArticles();

  if (!reportCards || !articles.length) return;

  if (!subscribed) {
    if (paywallBlock) paywallBlock.classList.remove("hidden");
    if (reportContent) reportContent.classList.add("hidden");
    return;
  }

  if (paywallBlock) paywallBlock.classList.add("hidden");
  if (reportContent) reportContent.classList.remove("hidden");

  const riskSet = new Set(flaggedSlugs);
  const relevant = articles.filter(
    (a) =>
      riskSet.has(a.slug) ||
      (a.labels && a.labels.some((l) => riskSet.has(l)))
  );
  const seen = new Set<string>();
  const deduped = relevant.filter((a) => {
    if (seen.has(a.slug)) return false;
    seen.add(a.slug);
    return true;
  });
  if (deduped.length === 0) {
    reportCards.innerHTML =
      '<p class="text-muted">No specific risk areas were flagged. We still recommend browsing our <a href="/" class="text-accent no-underline hover:underline">articles</a> for general guidance.</p>';
    runConversationStarters(subscribed);
    return;
  }

  reportCards.innerHTML = deduped
    .map(
      (a) =>
        `<article class="bg-surface border border-border rounded-lg py-4 px-5 hover:border-[#3d4654] transition-colors">
          <a href="/articles/${a.slug}/" class="block no-underline group">
            <h3 class="text-base font-semibold mb-1.5 text-[#e7e9ea] group-hover:text-accent transition-colors">${escapeHtml(a.title)}</h3>
            <p class="text-sm text-muted">${escapeHtml(a.excerpt)}</p>
            <span class="text-accent text-xs mt-2 inline-block">Read full article →</span>
          </a>
        </article>`
    )
    .join("");
  runConversationStarters(subscribed);
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function getPassions(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PASSIONS);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function setPassions(list: string[]): void {
  localStorage.setItem(STORAGE_PASSIONS, JSON.stringify(list));
}

function runConversationStarters(subscribed: boolean): void {
  const section = document.getElementById("conversation-starters-section");
  const listEl = document.getElementById("passions-list");
  const inputEl = document.getElementById("passion-input") as HTMLInputElement | null;
  const addBtn = document.getElementById("passion-add");
  const contentEl = document.getElementById("conversation-starters-content");
  if (!subscribed || !section || !listEl || !contentEl) return;
  const list = listEl;
  const content = contentEl;

  function renderPassionsList(): void {
    const passions = getPassions();
    list.innerHTML = passions
      .map(
        (name) =>
          `<li class="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-border text-[#e7e9ea] text-sm">
            <span>${escapeHtml(name)}</span>
            <button type="button" data-remove="${escapeHtml(name)}" class="text-muted hover:text-[#e7e9ea] focus:outline-none focus:ring-2 focus:ring-accent rounded leading-none" aria-label="Remove ${escapeHtml(name)}">×</button>
          </li>`
      )
      .join("");
    list.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = (btn as HTMLElement).getAttribute("data-remove");
        if (name) {
          setPassions(getPassions().filter((p) => p !== name));
          renderPassionsList();
          renderInterestBlocks();
        }
      });
    });
    renderInterestBlocks();
  }

  function renderInterestBlocks(): void {
    const passions = getPassions();
    content.innerHTML = passions
      .map(
        (interest, index) =>
          `<div class="passion-block rounded-xl border border-border bg-surface p-5" data-passion-index="${index}">
            <h3 class="text-lg font-semibold text-[#e7e9ea] mb-3">${escapeHtml(interest)}</h3>
            <div class="passion-topics" data-passion-index="${index}"></div>
            <button type="button" class="load-topics mt-2 text-sm font-medium text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent rounded" data-passion-index="${index}">Load latest topics</button>
          </div>`
      )
      .join("");
    content.querySelectorAll(".load-topics").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = (btn as HTMLElement).getAttribute("data-passion-index");
        const interest = idx !== null ? passions[Number(idx)] : undefined;
        if (interest) void loadTopicsForInterest(interest, Number(idx));
      });
    });
    passions.forEach((interest, index) => void loadTopicsForInterest(interest, index));
  }

  async function loadTopicsForInterest(interest: string, index: number): Promise<void> {
    const topicsEl = content.querySelector(`.passion-topics[data-passion-index="${index}"]`);
    const btn = content.querySelector(`.load-topics[data-passion-index="${index}"]`);
    if (!topicsEl) return;
    topicsEl.innerHTML = '<p class="text-muted text-sm">Loading…</p>';
    if (btn) (btn as HTMLButtonElement).disabled = true;
    try {
      const res = await fetch(`${TOPICS_API}?interest=${encodeURIComponent(interest)}`);
      const data = (await res.json()) as TopicsResponse;
      if (!res.ok || data.error) {
        topicsEl.innerHTML = `<p class="text-muted text-sm">${escapeHtml(data.error || "Could not load topics.")}</p>`;
        return;
      }
      const topics = (data.topics || []).slice(0, 3);
      if (topics.length === 0) {
        topicsEl.innerHTML = '<p class="text-muted text-sm">No recent topics found. Try again later.</p>';
        return;
      }
      topicsEl.innerHTML = topics
        .map(
          (t) =>
            `<div class="mb-4 p-4 rounded-lg bg-bg border border-border">
              <h4 class="font-semibold text-[#e7e9ea] mb-1">${escapeHtml(t.title)}</h4>
              <p class="text-sm text-muted mb-2">${escapeHtml(t.description)}</p>
              <p class="text-sm text-accent mb-2"><strong>Conversation starter:</strong> ${escapeHtml(t.conversationStarter)}</p>
              ${t.url ? `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener" class="text-accent text-xs hover:underline">Read more</a>` : ""}
            </div>`
        )
        .join("");
    } catch {
      topicsEl.innerHTML = '<p class="text-muted text-sm">Topics unavailable. If you deploy to Netlify, add GNEWS_API_KEY to enable this.</p>';
    } finally {
      if (btn) (btn as HTMLButtonElement).disabled = false;
    }
  }

  addBtn?.addEventListener("click", () => {
    const value = inputEl?.value?.trim();
    if (!value) return;
    const passions = getPassions();
    if (passions.includes(value)) return;
    setPassions([...passions, value]);
    if (inputEl) inputEl.value = "";
    renderPassionsList();
  });
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBtn?.click();
    }
  });
  renderPassionsList();
}

async function init(): Promise<void> {
  if (document.getElementById("assessment-quiz")) runQuiz();
  if (document.getElementById("assessment-paywall")) runPaywall();
  if (document.getElementById("assessment-report")) {
    await runReport();
  }
}

void init();
