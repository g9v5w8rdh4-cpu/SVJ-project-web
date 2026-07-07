document.documentElement.classList.remove("no-js");

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
      const formTarget = document.querySelector(targetSelector) || document.querySelector("[data-contact-form]");

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

document.querySelectorAll("[data-contact-form]").forEach((form) => {
  const status = form.querySelector("[data-form-status]");
  const submit = form.querySelector("button[type='submit']");
  prepareSpamFields(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const spamCheck = checkSpamFields(data);
    if (!spamCheck.ok) {
      if (status) status.textContent = spamCheck.message;
      return;
    }

    const payload = buildLeadPayload(form, data);

    if (status) status.textContent = "Odesílám poptávku...";
    if (submit) submit.disabled = true;

    try {
      const response = await fetch(LEADS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        if (status) status.textContent = result.message || "Poptávku se nepodařilo odeslat. Zkuste to prosím znovu.";
        return;
      }

      if (status) status.textContent = result.message || "Děkujeme. Poptávka byla odeslaná.";
      form.reset();
      refreshFormStartedAt(form);
    } catch (error) {
      console.error("SVJ lead form error", error);
      if (status) {
        status.textContent = "Odeslání se nepodařilo. Zkuste to prosím znovu za chvíli, nebo nám zavolejte.";
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});

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
    supabase_table: form.dataset.supabaseTable || "",
    submitted_at: new Date().toISOString(),
    fields
  };
}
