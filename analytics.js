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

    // Don't load GA from automated browsers. Headless QA runs and SEO crawlers otherwise
    // send real page_views: a fresh browser profile each run counts as a brand-new user,
    // no referrer files it under (direct)/(none), and an instant exit yields ~0s
    // engagement — which corrupts the new-user ratio, engagement time and source reports.
    // The UA list is deliberately explicit instead of a loose /bot/ pattern, because
    // "bot" appears inside real device UAs (e.g. CUBOT phones) and would drop real users.
    // NOTE: navigator.webdriver alone is not enough — it is FALSE under Chrome
    // --headless=new, so the UA token "HeadlessChrome" is the only reliable signal.
    var _ua = navigator.userAgent || '';
    if (/HeadlessChrome|Headless|Puppeteer|Playwright|PhantomJS|Lighthouse|Chrome-Lighthouse|Googlebot|bingbot|YandexBot|DuckDuckBot|Baiduspider|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot/i.test(_ua) || navigator.webdriver === true) return;

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

    // ── Outbound + affiliate click tracking ──
    // Why this exists: GA4 was only ever sending page_view, so the reports answered
    // "how many people read this page" and nothing else. Amazon's own report gives
    // clicks per tracking tag — one number for the whole site — so "which article
    // actually earns" was unanswerable from either side. Every affiliate decision
    // (where a link sits, which product to feature, whether to bother with a merchant)
    // was therefore unverifiable.
    //
    // Delegated from the document on purpose: one listener covers every <a> on the page,
    // including markup added later, and no per-link attribute has to stay in sync across
    // 77 files. Note this is capture phase, so it still runs if another handler
    // stopPropagation()s the event.
    //
    // transport_type:'beacon' is the part that matters. The visitor is navigating away in
    // the same tick as the click; a normal XHR hit gets cancelled mid-flight and the click
    // is silently lost. Beacon survives the unload.
    var PARTNERS = {
        'amazon.com': 'Amazon Associates',
        'amzn.to': 'Amazon Associates',
        'trupanion.com': 'Trupanion',
        'healthypawspetinsurance.com': 'Healthy Paws',
        'lemonade.com': 'Lemonade',
        'prettylitter.com': 'PrettyLitter',
        'tractorsupply.com': 'Tractor Supply'
    };

    function bareHost(host) {
        return String(host || '').toLowerCase().replace(/^www\./, '');
    }

    function partnerFor(host) {
        for (var key in PARTNERS) {
            if (host === key || host.slice(-(key.length + 1)) === '.' + key) return PARTNERS[key];
        }
        return '';
    }

    // How far down the page the clicked link sat, 0-100. This is the number that tells us
    // whether burying every buy link in the last 30% of the article is costing clicks.
    function depthPct(anchor) {
        try {
            var rect = anchor.getBoundingClientRect();
            var full = document.documentElement ? document.documentElement.scrollHeight : 0;
            if (!full || !rect) return -1;
            var top = rect.top + (window.pageYOffset || 0);
            return Math.max(0, Math.min(100, Math.round(top / full * 100)));
        } catch (e) { return -1; }
    }

    function reportClick(e) {
        // Declining consent deletes window.gtag; no gtag means we stay dark. Nothing to do.
        if (!window.gtag) return;
        var anchor = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!anchor) return;

        var href = anchor.href || anchor.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) return;

        var host;
        try { host = bareHost(new URL(href, window.location.href).hostname); }
        catch (err) { return; }
        if (host === bareHost(window.location.hostname)) return;   // internal navigation

        var partner = partnerFor(host);
        var params = {
            transport_type: 'beacon',
            link_domain: host,
            link_url: href,
            link_text: (anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
            link_position_pct: depthPct(anchor),
            affiliate_partner: partner,
            link_type: partner ? 'partner' : 'outbound'
        };

        // Amazon links carry two very different intents. A /dp/ link names one product the
        // reader has already decided about; a /s?k= link drops them on a results page we
        // control nothing about. Splitting them is how we find out if that matters.
        var asin = /\/dp\/([A-Z0-9]{10})/.exec(href);
        if (asin) { params.asin = asin[1]; params.link_type = 'product'; }
        else if (/\/s\?/.test(href)) { params.link_type = 'search'; }

        window.gtag('event', partner ? 'affiliate_click' : 'outbound_click', params);
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

    // Capture phase, so a later stopPropagation() can't hide a click. 'auxclick' catches
    // middle-click and cmd-click, which fire there instead of 'click' and would otherwise
    // be invisible — those open a background tab and are a real share of affiliate traffic.
    document.addEventListener('click', reportClick, true);
    document.addEventListener('auxclick', reportClick, true);

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
