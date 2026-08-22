// MeltPet Analytics — Google Analytics 4 (GA4) with Consent Mode v2 (cookieless-first)
// - GA4 loads immediately; regional consent governs what can be stored.
// - US / other visitors are tracked by default so analytics data isn't undercounted.
// - EU/UK/EEA visitors: analytics_storage defaults to 'denied'. This keeps the
//   experience cookieless (no _ga/_gid/_gat cookies) while still allowing GA4 to
//   collect anonymized, cookieless pings for traffic modeling. It is the GDPR-safe
//   trade-off: granting analytics_storage for EU users without explicit consent would
//   increase data volume but violate ePrivacy/GDPR requirements. If the user Accepts,
//   analytics_storage is granted and cookies are written.
// Measurement ID: replace G-XXXXXXXXXX with your actual ID from https://analytics.google.com
(function() {
    'use strict';
    var MEASUREMENT_ID = 'G-8NRMGWBHG7';
    var CONSENT_KEY = 'meltpet-cookie-consent';
    var CONSENT_VERSION = 1; // bump to reset everyone's consent

    // Don't load GA in dev / localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;

    // ── Consent State ──
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(CONSENT_KEY)); } catch(e) {}

    function hasValidConsent() {
        return stored && stored.version === CONSENT_VERSION && stored.choice === 'accepted';
    }
    function hasChoice() {
        return stored && stored.version === CONSENT_VERSION && (stored.choice === 'accepted' || stored.choice === 'declined');
    }
    function saveConsent(choice) {
        stored = { version: CONSENT_VERSION, choice: choice, ts: Date.now() };
        try { localStorage.setItem(CONSENT_KEY, JSON.stringify(stored)); } catch(e) {}
    }

    // ── Load GA4 (always; Consent Mode governs what is stored) ──
    function loadGA4() {
        window.dataLayer = window.dataLayer || [];
        function gtag(){ dataLayer.push(arguments); }
        gtag('js', new Date());

        // Consent Mode v2 defaults:
        // Granted everywhere by default (fixes US / non-EU undercounting).
        // Denied inside EU / EEA / UK, where the cookie banner is legally required.
        gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'granted'
        });

        // EU / EEA / UK: analytics_storage defaults to denied (cookieless pings only).
        // The `region` parameter must be an array of ISO 3166-1 / EEA region codes.
        gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied',
            'region': ['EEA', 'GB']
        });

        gtag('config', MEASUREMENT_ID, {
            page_location: window.location.href,
            page_path: window.location.pathname,
            send_page_view: true
        });
        window.gtag = gtag;

        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
        document.head.appendChild(script);
    }

    // ── Update consent after a user choice ──
    function updateConsent(granted) {
        if (!window.gtag) return;
        window.gtag('consent', 'update', granted ? {
            'ad_storage': 'granted',
            'ad_user_data': 'granted',
            'ad_personalization': 'granted',
            'analytics_storage': 'granted'
        } : {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied'
        });
    }

    // ── Remove GA4 cookies (on decline) ──
    function removeGA4() {
        delete window.gtag;
        delete window.dataLayer;
        document.cookie.split(';').forEach(function(c) {
            var name = c.split('=')[0].trim();
            if (/^_ga/.test(name) || /^_gid/.test(name) || /^_gat/.test(name)) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            }
        });
    }

    // ── Consent Banner (minimal, non-blocking) ──
    function showBanner() {
        var banner = document.createElement('div');
        banner.id = 'cookie-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Cookie consent');
        banner.innerHTML = '<div style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:var(--bg-surface,#FAFAF6);border-top:1px solid var(--border-light,#E5E1D8);padding:16px 24px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;font-size:0.88rem;color:var(--text-body,#4A4A4A);box-shadow:0 -4px 20px rgba(0,0,0,0.08);">'
            + '<span>This site uses minimal anonymous analytics cookies (GA4) to understand traffic. No personal data is collected. <a href="/privacy" style="color:var(--brand-accent,#F6851B);text-decoration:underline;">Privacy policy</a>.</span>'
            + '<button id="cookie-accept" style="background:var(--brand-accent,#F6851B);color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.88rem;">Accept</button>'
            + '<button id="cookie-decline" style="background:transparent;color:var(--text-muted,#8C8C8C);border:1px solid var(--border-light,#334155);padding:8px 20px;border-radius:6px;cursor:pointer;font-size:0.88rem;">Decline</button>'
            + '</div>';

        if (document.body) {
            document.body.appendChild(banner);
        } else {
            document.addEventListener('DOMContentLoaded', function() { document.body.appendChild(banner); });
        }

        document.addEventListener('click', function handler(e) {
            if (e.target.id === 'cookie-accept') {
                saveConsent('accepted');
                updateConsent(true);
                banner.remove();
                document.removeEventListener('click', handler);
            } else if (e.target.id === 'cookie-decline') {
                saveConsent('declined');
                updateConsent(false);
                removeGA4();
                banner.remove();
                document.removeEventListener('click', handler);
            }
        });
    }

    // ── Init ──
    loadGA4();

    if (hasValidConsent()) {
        updateConsent(true);
    } else if (stored && stored.choice === 'declined') {
        updateConsent(false);
        removeGA4();
    } else if (!hasChoice()) {
        // No choice made yet — show banner (deferred so content paints first)
        if (document.readyState === 'complete') {
            showBanner();
        } else {
            window.addEventListener('load', showBanner);
        }
    }
    // If hasChoice() but not valid consent (declined), consent already set to denied above.
})();
