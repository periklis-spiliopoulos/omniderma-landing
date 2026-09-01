(function () {
  "use strict";

  const GOOGLE_TAG_ID = "AW-18422990044";
  const STORAGE_KEY = "omniderma-consent-v1";
  const GOOGLE_TAG_SCRIPT_ID = "omniderma-google-tag";

  const DENIED_CONSENT = {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  };

  const MEASUREMENT_CONSENT = {
    ad_storage: "granted",
    analytics_storage: "granted",
    ad_user_data: "granted",
    // OmniDerma does not use personalized advertising or remarketing.
    ad_personalization: "denied"
  };

  const copy = {
    en: {
      title: "Privacy choices",
      description:
        "We use optional Google Ads measurement only if you accept. Necessary site functions work without it, and no advertising tag loads before your choice.",
      legal: "Cookie details",
      necessary: "Necessary only",
      measurement: "Accept measurement",
      settings: "Privacy choices",
      statusNecessary: "Current choice: necessary functions only.",
      statusMeasurement: "Current choice: measurement enabled. Advertising personalization remains disabled."
    },
    el: {
      title: "Επιλογές απορρήτου",
      description:
        "Χρησιμοποιούμε προαιρετική μέτρηση Google Ads μόνο αν συμφωνήσετε. Οι απαραίτητες λειτουργίες του ιστότοπου λειτουργούν χωρίς αυτή και δεν φορτώνεται διαφημιστική ετικέτα πριν από την επιλογή σας.",
      legal: "Λεπτομέρειες cookies",
      necessary: "Μόνο απαραίτητα",
      measurement: "Αποδοχή μέτρησης",
      settings: "Επιλογές απορρήτου",
      statusNecessary: "Τρέχουσα επιλογή: μόνο απαραίτητες λειτουργίες.",
      statusMeasurement: "Τρέχουσα επιλογή: η μέτρηση είναι ενεργή. Η εξατομίκευση διαφημίσεων παραμένει απενεργοποιημένη."
    }
  };

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  // This must run before any possible Google tag load.
  window.gtag("consent", "default", DENIED_CONSENT);

  let currentChoice = readChoice();
  let tagLoaded = false;
  let consentBanner;
  let settingsButton;
  let previouslyFocusedElement;

  if (currentChoice === "measurement") {
    grantMeasurementAndLoadTag();
  }

  onDocumentReady(function () {
    createSettingsButton();
    createConsentBanner();

    if (!currentChoice) {
      openConsentBanner();
    }

    observeLanguageChanges();
  });

  function onDocumentReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }

    callback();
  }

  function readChoice() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      return saved && (saved.choice === "necessary" || saved.choice === "measurement")
        ? saved.choice
        : null;
    } catch (error) {
      return null;
    }
  }

  function saveChoice(choice) {
    currentChoice = choice;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, choice: choice })
      );
    } catch (error) {
      // Consent still applies to the current page if local storage is unavailable.
    }
  }

  function grantMeasurementAndLoadTag() {
    window.gtag("consent", "update", MEASUREMENT_CONSENT);
    loadGoogleTag();
  }

  function loadGoogleTag() {
    if (
      tagLoaded ||
      document.getElementById(GOOGLE_TAG_SCRIPT_ID) ||
      document.querySelector('script[src*="googletagmanager.com/gtag/js"]')
    ) {
      return;
    }

    tagLoaded = true;
    document.documentElement.dataset.googleTagLoaded = "true";

    const tagScript = document.createElement("script");
    tagScript.id = GOOGLE_TAG_SCRIPT_ID;
    tagScript.async = true;
    tagScript.src =
      "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GOOGLE_TAG_ID);
    document.head.appendChild(tagScript);

    window.gtag("js", new Date());
    window.gtag("config", GOOGLE_TAG_ID, {
      allow_ad_personalization_signals: false
    });
  }

  function chooseNecessaryOnly() {
    const shouldReload = tagLoaded || Boolean(
      document.querySelector('script[src*="googletagmanager.com/gtag/js"]')
    );

    window.gtag("consent", "update", DENIED_CONSENT);
    saveChoice("necessary");
    closeConsentBanner();

    if (shouldReload) {
      window.location.reload();
    }
  }

  function chooseMeasurement() {
    saveChoice("measurement");
    grantMeasurementAndLoadTag();
    closeConsentBanner();
  }

  function createConsentBanner() {
    consentBanner = document.createElement("section");
    consentBanner.id = "omniderma-consent";
    consentBanner.className = "omni-consent";
    consentBanner.setAttribute("role", "dialog");
    consentBanner.setAttribute("aria-labelledby", "omni-consent-title");
    consentBanner.setAttribute("aria-describedby", "omni-consent-description");
    consentBanner.hidden = true;
    consentBanner.innerHTML =
      '<div class="omni-consent__copy">' +
        '<h2 id="omni-consent-title"></h2>' +
        '<p id="omni-consent-description"></p>' +
        '<p class="omni-consent__status" id="omni-consent-status" hidden></p>' +
        '<a class="omni-consent__legal" href="/legal/#cookies"></a>' +
      "</div>" +
      '<div class="omni-consent__actions">' +
        '<button type="button" class="omni-consent__button omni-consent__button--secondary" data-consent-choice="necessary"></button>' +
        '<button type="button" class="omni-consent__button omni-consent__button--primary" data-consent-choice="measurement"></button>' +
      "</div>";

    consentBanner
      .querySelector('[data-consent-choice="necessary"]')
      .addEventListener("click", chooseNecessaryOnly);
    consentBanner
      .querySelector('[data-consent-choice="measurement"]')
      .addEventListener("click", chooseMeasurement);

    document.body.appendChild(consentBanner);
    updateConsentCopy();
  }

  function createSettingsButton() {
    const footer = document.querySelector("footer");
    if (!footer) return;

    settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "omni-consent-settings";
    settingsButton.addEventListener("click", openConsentBanner);

    const footerTarget = footer.querySelector(".footer-center") || footer;
    footerTarget.appendChild(settingsButton);
    updateConsentCopy();
  }

  function openConsentBanner() {
    if (!consentBanner) return;

    previouslyFocusedElement = document.activeElement;
    updateConsentCopy();
    consentBanner.hidden = false;

    window.requestAnimationFrame(function () {
      const preferredButton = consentBanner.querySelector(
        currentChoice === "measurement"
          ? '[data-consent-choice="measurement"]'
          : '[data-consent-choice="necessary"]'
      );
      if (preferredButton) preferredButton.focus({ preventScroll: true });
    });
  }

  function closeConsentBanner() {
    if (!consentBanner) return;

    consentBanner.hidden = true;
    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === "function") {
      previouslyFocusedElement.focus({ preventScroll: true });
    }
  }

  function getLanguage() {
    return document.documentElement.lang.toLowerCase().startsWith("el") ? "el" : "en";
  }

  function updateConsentCopy() {
    const text = copy[getLanguage()];

    if (settingsButton) {
      settingsButton.textContent = text.settings;
      settingsButton.setAttribute("aria-label", text.settings);
    }

    if (!consentBanner) return;

    consentBanner.querySelector("#omni-consent-title").textContent = text.title;
    consentBanner.querySelector("#omni-consent-description").textContent = text.description;
    consentBanner.querySelector(".omni-consent__legal").textContent = text.legal;
    consentBanner.querySelector('[data-consent-choice="necessary"]').textContent = text.necessary;
    consentBanner.querySelector('[data-consent-choice="measurement"]').textContent = text.measurement;

    const status = consentBanner.querySelector("#omni-consent-status");
    status.hidden = !currentChoice;
    status.textContent = currentChoice === "measurement"
      ? text.statusMeasurement
      : text.statusNecessary;
  }

  function observeLanguageChanges() {
    const observer = new MutationObserver(updateConsentCopy);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"]
    });
  }
})();
