document.documentElement.classList.remove("no-js");

document.documentElement.dataset.svjScript = "leads-v3";

const LEADS_ENDPOINT = "https://xktkgpbqsptsxjajsofl.supabase.co/functions/v1/svj-leads";

const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const moneyFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0
});

document.querySelectorAll("[data-estimator]").forEach((estimator) => {
  const base = Number(estimator.dataset.base || 0);
  const subject = estimator.dataset.subject || "Poptávka SVJ Project";
  const totalNode = estimator.querySelector("[data-total]");
  const link = estimator.querySelector("[data-estimate-link]");
  const inputs = Array.from(estimator.querySelectorAll("input[type='checkbox'][data-price]"));
  let estimateSummary = "";

  const updateEstimate = () => {
    const selected = inputs.filter((input) => input.checked);
    const total = selected.reduce((sum, input) => sum + Number(input.dataset.price || 0), base);
    const selectedLabels = selected.map((input) => input.parentElement.textContent.trim());

    estimateSummary = [
      subject,
      "",
      "Orientační výběr z kalkulátoru:",
      selectedLabels.length ? selectedLabels.map((label) => `- ${label}`).join("\n") : "- zatím bez vybraných položek",
      "",
      `Orientační částka z webu: ${moneyFormatter.format(total)}`,
      "",
      "Konkrétní zadání:"
    ].join("\n");

    if (totalNode) totalNode.textContent = moneyFormatter.format(total);
    if (link) link.setAttribute("href", estimator.dataset.target || "#poptavka");
  };

  if (link) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const targetSelector = estimator.dataset.target || "#poptavka";
      const formTarget = document.querySelector(targetSelector)?.querySelector("form") || document.querySelector("[data-contact-form], form.contact-form");

      if (formTarget) {
        formTarget.scrollIntoView({ behavior: "smooth", block: "start" });
        const messageField = formTarget.querySelector("textarea[name='message'], textarea[name='problem'], textarea[name='intended_use']");
        if (messageField && !messageField.value.trim()) {
          messageField.value = estimateSummary;
          messageField.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    });
  }

  inputs.forEach((input) => input.addEventListener("change", updateEstimate));
  updateEstimate();
});

const contactForms = Array.from(document.querySelectorAll("[data-contact-form], form.contact-form"));

contactForms.forEach((form) => {
  if (form.dataset.svjBound === "true") return;
  form.dataset.svjBound = "true";

  const status = ensureFormStatus(form);
  const submit = form.querySelector("button[type='submit']");
  prepareSpamFields(form);
  setFormStatus(status, "Online formulář je připravený. Vyplňte údaje a klikněte na odeslat.", "ready");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    setFormStatus(status, "Kontroluji formulář...", "loading");

    if (!form.reportValidity()) {
      setFormStatus(status, "Doplňte prosím povinná pole označená formulářem.", "warning");
      return;
    }

    const data = new FormData(form);
    const spamCheck = checkSpamFields(data);
    if (!spamCheck.ok) {
      setFormStatus(status, spamCheck.message, "warning");
      return;
    }

    const payload = buildLeadPayload(form, data);

    setFormStatus(status, "Odesílám poptávku do SVJ systému...", "loading");
    if (submit) submit.disabled = true;

    try {
      const response = await fetch(LEADS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        setFormStatus(status, result.message || "Poptávku se nepodařilo odeslat. Zkuste to prosím znovu.", "error");
        return;
      }

      setFormStatus(status, result.message || "Děkujeme. Poptávka byla odeslaná.", "success");
      form.reset();
      refreshFormStartedAt(form);
    } catch (error) {
      console.error("SVJ lead form error", error);
      setFormStatus(status, "Odeslání se nepodařilo. Zkuste to prosím znovu za chvíli, nebo nám zavolejte.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});

function ensureFormStatus(form) {
  let status = form.querySelector("[data-form-status]");
  if (status) {
    status.classList.add("form-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    return status;
  }

  status = document.createElement("p");
  status.setAttribute("data-form-status", "");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.className = "form-status";

  const submit = form.querySelector("button[type='submit']");
  if (submit) {
    submit.insertAdjacentElement("afterend", status);
  } else {
    form.append(status);
  }
  return status;
}

function setFormStatus(status, message, type) {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = type;
}

function prepareSpamFields(form) {
  if (!form.querySelector("[name='website']")) {
    const honeypot = document.createElement("label");
    honeypot.className = "hp-field";
    honeypot.setAttribute("aria-hidden", "true");
    honeypot.innerHTML = '<span>Web</span><input name="website" tabindex="-1" autocomplete="off">';
    form.prepend(honeypot);
  }

  if (!form.querySelector("[name='form_started_at']")) {
    const startedAt = document.createElement("input");
    startedAt.type = "hidden";
    startedAt.name = "form_started_at";
    form.append(startedAt);
  }

  refreshFormStartedAt(form);
}

function refreshFormStartedAt(form) {
  const startedAt = form.querySelector("[name='form_started_at']");
  if (startedAt) startedAt.value = String(Date.now());
}

function checkSpamFields(data) {
  if (String(data.get("website") || "").trim()) {
    return { ok: false, message: "Děkujeme." };
  }

  const startedAt = Number(data.get("form_started_at") || 0);
  if (!startedAt || Date.now() - startedAt < 1500) {
    return { ok: false, message: "Počkejte prosím pár vteřin a odešlete formulář znovu." };
  }

  return { ok: true };
}

function buildLeadPayload(form, data) {
  const fields = {};

  data.forEach((value, key) => {
    if (key === "consent") return;
    fields[key] = typeof value === "string" ? value.trim() : value;
  });

  if (!fields.source_page) fields.source_page = window.location.pathname || "/";

  return {
    form_name: form.dataset.formName || "svj-form",
    subject: form.dataset.subject || "Poptávka SVJ Project",
    supabase_table: form.dataset.supabaseTable || inferSupabaseTableFromPath(),
    submitted_at: new Date().toISOString(),
    fields
  };
}

function inferSupabaseTableFromPath() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("print")) return "print_requests";
  if (path.includes("media")) return "media_requests";
  if (path.includes("autoservis")) return "service_requests";
  if (path.includes("evolution")) return "evolution_waitlist";
  return "leads";
}
