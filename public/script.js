document.documentElement.classList.remove("no-js");

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
  const mail = estimator.dataset.mail || "info@svjprojekt.cz";
  const subject = estimator.dataset.subject || "Poptávka SVJ Project";
  const totalNode = estimator.querySelector("[data-total]");
  const link = estimator.querySelector("[data-estimate-link]");
  const inputs = Array.from(estimator.querySelectorAll("input[type='checkbox'][data-price]"));

  const updateEstimate = () => {
    const selected = inputs.filter((input) => input.checked);
    const total = selected.reduce((sum, input) => sum + Number(input.dataset.price || 0), base);
    const selectedLabels = selected.map((input) => input.parentElement.textContent.trim());
    const body = [
      "Dobrý den,",
      "",
      "posílám orientační poptávku:",
      selectedLabels.length ? selectedLabels.map((label) => `- ${label}`).join("\n") : "- zatím bez vybraných položek",
      "",
      `Orientační částka z webu: ${moneyFormatter.format(total)}`,
      "",
      "Doplňuji konkrétní zadání:"
    ].join("\n");

    if (totalNode) totalNode.textContent = moneyFormatter.format(total);
    if (link) {
      link.href = `mailto:${mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
  };

  inputs.forEach((input) => input.addEventListener("change", updateEstimate));
  updateEstimate();
});

document.querySelectorAll("[data-contact-form]").forEach((form) => {
  const status = form.querySelector("[data-form-status]");
  const submit = form.querySelector("button[type='submit']");
  const subject = form.dataset.subject || "Poptávka SVJ Project";
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

    const emailTarget = getMailTarget(form);
    const body = buildMailBody(data, form.dataset.formName || "svj-form");
    const payload = buildLeadPayload(form, data);

    if (status) status.textContent = "Odesílám poptávku...";
    if (submit) submit.disabled = true;

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        if (response.status >= 500 || response.status === 404 || response.status === 503) {
          throw new Error("endpoint-unavailable");
        }

        if (status) status.textContent = result.message || "Zkontrolujte prosím vyplněné údaje.";
        return;
      }

      if (status) status.textContent = result.message || "Děkujeme. Poptávka byla odeslaná.";
      form.reset();
      refreshFormStartedAt(form);
    } catch {
      if (status) status.textContent = "Online odeslání teď neběží. Otevřu e-mail jako náhradní cestu.";
      window.setTimeout(() => {
        window.location.href = `mailto:${emailTarget}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }, 350);
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

  return {
    form_name: form.dataset.formName || "svj-form",
    subject: form.dataset.subject || "Poptávka SVJ Project",
    supabase_table: form.dataset.supabaseTable || "",
    submitted_at: new Date().toISOString(),
    fields
  };
}

function getMailTarget(form) {
  const source = form.querySelector("[name='division'], [name='product'], [name='brand_scope']")?.value || "";

  if (source.includes("print")) return "print@svjprojekt.cz";
  if (source.includes("media")) return "media@svjprojekt.cz";
  if (source.includes("autoservis")) return "autoservis@svjprojekt.cz";
  if (source.includes("evolution")) return "evolution@svjprojekt.cz";
  return "info@svjprojekt.cz";
}

function buildMailBody(data, formName) {
  const labels = {
    source_page: "Stránka",
    division: "Divize",
    brand_scope: "Rozsah značky",
    product: "Produkt",
    name: "Jméno / firma",
    email: "E-mail",
    phone: "Telefon",
    service: "Služba",
    product_type: "Typ produktu",
    dimensions: "Rozměr",
    quantity: "Množství",
    material: "Materiál",
    lamination: "Laminace / dokončení",
    deadline: "Termín",
    service_type: "Typ služby",
    platform: "Platforma",
    goal: "Cíl",
    audience: "Cílový zákazník",
    brand_style: "Styl značky",
    deliverables: "Požadované výstupy",
    budget_range: "Rozpočet",
    links: "Odkazy / inspirace",
    car_brand: "Značka auta",
    car_model: "Model auta",
    car_year: "Rok auta",
    engine: "Motor",
    mileage: "Najeto km",
    problem: "Problém / zadání",
    preferred_date: "Preferovaný termín",
    user_type: "Typ uživatele",
    intended_use_type: "Hlavní téma použití",
    company_name: "Firma / provoz",
    intended_use: "Zamýšlené použití",
    message: "Zpráva"
  };

  const fields = [["Formulář", formName]];

  data.forEach((value, key) => {
    if (!value || ["consent", "website", "form_started_at"].includes(key)) return;
    fields.push([labels[key] || key, value]);
  });

  return fields
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}
