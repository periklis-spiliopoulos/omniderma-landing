# Google Ads CTA conversion tracking

Implementation and pre-deployment validation: 2026-11-08. Scope: the public OmniDerma landing repository only. Production publishing uses the existing GitHub `main` branch to Vercel integration.

## Files

- `cookie-consent.js`: adds the two consent-gated CTA handlers and guards against repeated initialization.
- `index.html`: removes the old `core_request_clicked` handler; all markup, styling, navigation, and email URLs are unchanged.
- `tests/ads-conversions.test.cjs`: dependency-free regression checks, run with `node --test tests/ads-conversions.test.cjs`.
- `docs/google-ads-tracking.md`: implementation, validation results, and account-side handoff.

## Existing infrastructure

The site is buildless HTML/CSS/JavaScript. There is no package manifest, build command, dependency installation, or existing test runner. The landing, legal, and app-manual pages share `/cookie-consent.js` and `/cookie-consent.css`.

The shared consent script owns `window.dataLayer`, the `gtag` queue, and a single asynchronous Google tag for `AW-18422990044`. It loads Google only after measurement consent. No Google Analytics measurement ID, GTM container, additional Ads installation, or third-party CMP was found in the repository. The original landing contained a generic `core_request_clicked` event but neither requested Ads conversion. A live fetch confirmed that the public site's index and consent script matched the starting checkout.

## Conversion behavior

Both case-sensitive labels were verified against the original Google Ads snippets in the supplied `Untitled.pages` document, including inspection of its preview. The document is used as configuration evidence; its callback-based navigation code was not copied.

| Conversion action | Existing anchor | `send_to` |
| --- | --- | --- |
| OmniDerma - Core Access Click | `#core-promo-cta` — Request Core | `AW-18422990044/VHqqCNynu7QdENyJ4tBE` |
| OmniDerma - Demo Request Click | `#contact-cta` — Request a Demo email CTA | `AW-18422990044/db_dCN-nu7QdENyJ4tBE` |

Each trusted, uncanceled browser click calls `gtag("event", "conversion", { send_to: ..., user_data: {} })` once, only with current measurement consent. Direct anchor listeners also cover clicks on nested content and keyboard activation. Programmatic clicks are ignored. The initialization guard prevents repeated script inclusion from adding listeners or tags twice. The old generic Core listener is removed.

The hero's Request a Demo link (`#hero-btn-1`) still scrolls to `#contact`; it does not record a conversion. The separate Request free access email link is also unchanged and untracked.

No click handler cancels navigation, returns false, changes an href, waits for a request, or installs an event callback. Missing or throwing `gtag` is safely ignored. If the external tag is blocked, its normal queue may remain unsent; email behavior is independent. No value, currency, email address, mail subject/body, populated user-data object, or medical data is added to conversion payloads. These actions represent intent to open an email composer, not sent emails, submitted leads, or revenue.

The live audit found automatic user-provided-data detection enabled in Google's served tag configuration. The landing now sets `allow_enhanced_conversions: false` and an empty `user_data` in tag configuration, and explicitly overrides `user_data` with an empty object in each conversion. The empty override opts these events out of automatic first-party data enrichment; see Google's [event-level user-data opt-out guidance](https://support.google.com/google-ads/answer/13262500?hl=en). No populated user-data object is provided. Account-side user-provided-data capabilities and unnecessary automatic event detection should also be disabled. Their presence in served configuration does not prove that personal data was transmitted, and conversion-request payloads still require a real click/network verification.

## Consent and attribution

The existing basic Consent Mode v2 is retained:

| Signal | Initial / necessary only | Accept measurement |
| --- | --- | --- |
| `ad_storage` | denied | granted |
| `analytics_storage` | denied | granted |
| `ad_user_data` | denied | granted |
| `ad_personalization` | denied | denied |

Defaults run before tag configuration. The existing local-storage preference (`omniderma-consent-v1`) is restored on later pages. Rejection sends no Google requests and queues no conversion events. Previously rejected clicks are never replayed after a later grant. Revocation updates all signals to denied, saves the preference, and reloads to stop the tag. Personalization remains disabled in tag configuration. No consent UI or translations changed. This follows Google's [Consent Mode setup guidance](https://developers.google.com/tag-platform/security/guides/consent).

Tracking never rewrites the page URL or query string. Existing `gclid` and other auto-tagging parameters remain available to the Google tag after consent. No click identifiers are copied into mailto URLs or stored before consent by this change.

## Validation results

- **Passed:** all 11 Node regression checks, external-script syntax validation, inline-script syntax validation for all three public HTML pages, and `git diff --check`.
- **Passed in the local desktop browser:** no Google script, configuration, conversion, or Google tracking resource before consent or after rejection; acceptance adds one Google tag and one configuration; an accepted-consent reload still initializes one tag and zero click conversions. Google resources load after acceptance with personalization disabled (`npa=1`). No JavaScript errors or warnings were captured.
- **Passed in regression checks:** independent exact conversion payloads; no conversion on load, rejection, canceled/synthetic clicks, or unrelated CTAs; nested-content and repeated-inclusion deduplication; missing/throwing/blocked tag handling; storage-blocked consent; revocation; unchanged recipients and full Core mail subject/body; unchanged `gclid` URL.
- **Not completed:** independent Google Tag Assistant conversion-hit verification. Tag Assistant was opened and a localhost debug connection attempted, but it timed out and reported no connection. No account/container access was available in that browser.
- **Not completed:** opening native desktop/mobile email applications and confirming actual network conversion-hit counts. Browser security controls blocked the native `mailto:` action. No attempt was made to bypass that restriction. A requested narrow viewport override did not take effect in this browser, so mobile device behavior remains unverified.
- No build step exists for this static site. The checks above cover the implementation before deployment. No authenticated Google Ads settings changes or changes to Professional, Core, Office, or Aesthetica were made.

## Required account-side and manual checks

1. **Account action required: fix conversion values.** The original Core snippet explicitly contains `value: 1.0` and `currency: "EUR"`. This would treat each click as €1 of conversion value. The implementation omits both, but omission does not override an account-side default value. In Google Ads, inspect **both** actions and select **Don't use a value for this conversion action**. The actual account settings could not be inspected. See Google's [conversion value settings](https://support.google.com/google-ads/answer/13064107?hl=en).
2. Retain the click-specific names and use an appropriate contact/interest category. Do not classify them as completed email submissions or qualified leads. Review whether each should be secondary/observation-only or deliberately included in bidding goals; a click is the only outcome this code can measure.
3. Review **Count** for each action. **One** per ad interaction is suitable if repeated interest clicks should not increase the reported conversion count; the site sends one event per real click, not a lifetime or session cap. See [Google's counting options](https://support.google.com/google-ads/answer/3438531?hl=en).
4. Check that account [auto-tagging is enabled](https://support.google.com/google-ads/answer/3095550?hl=en) and any hosting redirects retain click identifiers. Disable enhanced conversions and **Allow user-provided data capabilities** for this tag; the live audit found automatic email, phone, and address detection enabled in Google's served configuration. Review and disable unnecessary automatic event detection (including outbound clicks and form interactions), and remove additional URL-based/GA4/GTM rules for these same CTAs. The site provides explicit empty user-data overrides, but account settings should match the intended minimal measurement. See [Google tag configuration](https://support.google.com/google-ads/answer/12131703?hl=en).
5. On a review/staging deployment in a normal supported browser, connect [Google Tag Assistant](https://tagassistant.google.com/), or record requests in DevTools Network without Tag Assistant. Start with cleared consent: verify no Google traffic or conversion on load, then reject and click both CTAs (still none). Accept measurement, verify one tag, and click Core and the contact Demo email CTA separately: verify the exact labels above, one conversion event per click, and no revenue value, currency, populated user-data fields, or personal-data hashes. Check consent states, revoke consent, and confirm events stop. Check request initiators before interpreting multiple Google transport endpoints as duplicate events.
6. On desktop and a real mobile device, verify both email composers open immediately, the Core recipient/subject/body are preserved, the Demo recipient is preserved, and the hero still scrolls without a conversion. Test blocked Google requests and inspect the browser console. Repeat the Tag Assistant checks against production after deployment.
7. Review the existing legal cookie disclosure: it currently describes optional analytics/marketing as a future possibility, although the existing banner already offers Ads measurement. Any policy text update should reflect the actual measurement and consent choices.
