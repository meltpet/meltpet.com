// meltpet.com — Unified Client Engine v2 (2026-07-06)
// Desktop nav injection, theme toggle, mobile nav, search, related articles.
// Single data source: add new pages to NAV_SECTIONS — everything updates automatically.
(function() {
    'use strict';

    // ── Theme ──
    var THEME_KEY = 'meltpet-theme';
    if (localStorage.getItem(THEME_KEY) === 'dark') {
        document.body.classList.add('dark-theme');
    }
    function toggleTheme() {
        var isDark = document.body.classList.contains('dark-theme');
        if (isDark) {
            document.body.classList.remove('dark-theme');
            localStorage.setItem(THEME_KEY, 'light');
        } else {
            document.body.classList.add('dark-theme');
            localStorage.setItem(THEME_KEY, 'dark');
        }
        updateThemeIcon();
    }
    function updateThemeIcon() {
        var btn = document.getElementById('btn-theme');
        if (btn) {
            btn.textContent = document.body.classList.contains('dark-theme') ? '☀' : '☽';
        }
    }

    // ── Shared Nav Data (Single Source of Truth) ──
    // `desktop: false` items appear in mobile nav + search, but not the desktop dropdowns.
    var NAV_SECTIONS = {
        tools: [
            {title: '🔍 Breed Finder Hub',          href: '/breed-finder',                desktop: true, keywords: 'breed finder quiz dog cat match finder hub'},
            {title: '🐶 Dog Breed Finder',          href: '/dog-breed-finder',            desktop: true, keywords: 'dog breed finder quiz match what dog should i get puppy breed selector'},
            {title: '🐱 Cat Breed Finder',          href: '/cat-breed-finder',            desktop: true, keywords: 'cat breed finder quiz match what cat should i get kitten breed selector'},
            {title: '💰 Cost Calculator',           href: '/monthly-pet-cost',            desktop: true, keywords: 'cost calculator monthly pet food vet insurance grooming'},
            {title: '⚖️ Adopt vs Buy',              href: '/adopt-vs-buy',                desktop: true, keywords: 'adopt buy cost comparison shelter breeder calculator'},
            {title: '📅 Age Calculator',            href: '/pet-age-calculator',          desktop: true, keywords: 'pet age calculator dog cat human years convert old 7 year rule myth'},
            {title: '🏷️ Name Generator',            href: '/pet-name-generator',          desktop: true, keywords: 'pet name generator dog cat names food funny classic human name ideas'},
            {title: '🍽️ Toxic Food Checker',        href: '/toxic-food-checker',          desktop: true, keywords: 'toxic food checker can my dog eat chocolate grapes onion garlic safe dangerous foods'},
            {title: '🍖 Dog Food Cost Calculator',   href: '/dog-food-cost-calculator',    desktop: true, keywords: 'dog food cost calculator monthly annual kibble wet raw dry food budget'},
            {title: '⚖️ Dog Weight Checker',        href: '/dog-weight-calculator',       desktop: true, keywords: 'dog weight calculator overweight obese BCS body condition score ideal weight check if dog fat'},
            {title: '🐱 Cat Calorie Calculator',    href: '/cat-calorie-calculator',      desktop: true, keywords: 'cat calorie calculator how much to feed cat RER DER portions cans cups wet dry food daily calories'},
            {title: '🥫 Cat Food Carb Calculator',   href: '/cat-food-carb-calculator',     desktop: true, keywords: 'cat food carbohydrate calculator dry matter basis carbs protein fat fiber ash moisture guaranteed analysis wet dry comparison hidden carbs'},
            {title: '🧩 Pet Compatibility Quiz',     href: '/pet-compatibility-quiz',      desktop: true, keywords: 'pet compatibility quiz dog or cat which pet is right for me lifestyle match'}
        ],
        dogs: [
            {title: '🐕 Golden Retriever',          href: '/golden-retriever-guide',          desktop: true, keywords: 'golden retriever dog breed guide cost cancer temperament'},
            {title: '🇫🇷 French Bulldog',            href: '/french-bulldog-guide',            desktop: true, keywords: 'french bulldog dog breed guide cost health spine'},
            {title: '🐺 German Shepherd',           href: '/german-shepherd-guide',           desktop: true, keywords: 'german shepherd dog breed guide cost temperament'},
            {title: '🦮 Labrador Retriever',        href: '/labrador-retriever-guide',        desktop: true, keywords: 'labrador retriever dog breed guide cost temperament'},
            {title: '🐑 Australian Shepherd',       href: '/australian-shepherd-guide',       desktop: true, keywords: 'australian shepherd dog breed guide cost intelligence'},
            {title: '🌭 Dachshund',                 href: '/dachshund-guide',                desktop: true, keywords: 'dachshund dog breed guide IVDD spine back wiener dog cost temperament'},
            {title: '🐩 Poodle',                     href: '/poodle-guide',                   desktop: true, keywords: 'poodle dog breed guide toy miniature standard cost grooming intelligence hypoallergenic'},
            {title: '🐕 Pembroke Welsh Corgi',       href: '/corgi-guide',                     desktop: true, keywords: 'corgi pembroke welsh dog breed guide IVDD DM herding cost temperament'},
            {title: '⚔️ Golden vs Labrador',         href: '/golden-vs-labrador',              desktop: true, keywords: 'golden retriever vs labrador comparison which is better family dog temperament cost health'}
        ],
        cats: [
            {title: '🦁 Maine Coon Guide',          href: '/maine-coon-guide',                desktop: true, keywords: 'maine coon cat breed guide cost temperament'},
            {title: '🐱 Ragdoll Cat Guide',         href: '/ragdoll-cat-guide',               desktop: true, keywords: 'ragdoll cat breed guide floppy affectionate lap cat blue eyes'},
            {title: '🐆 Bengal Cat Guide',          href: '/bengal-cat-guide',                desktop: true, keywords: 'bengal cat breed guide wild spotted energetic leopard'},
            {title: '🐱 Sphynx Cat Guide',          href: '/sphynx-cat-guide',                desktop: true, keywords: 'sphynx cat breed guide hairless bald HCM bathing care cost'},
            {title: '🇬🇧 British Shorthair',          href: '/british-shorthair-guide',          desktop: true, keywords: 'british shorthair cat breed guide blue HCM PKD plush coat calm reserved'},
            {title: '⚖️ Maine Coon vs Ragdoll',       href: '/maine-coon-vs-ragdoll',            desktop: true, keywords: 'maine coon vs ragdoll comparison which big cat temperament grooming health cost'},
            {title: '🐱 New Kitten Checklist',      href: '/new-kitten-checklist',            desktop: true, keywords: 'new kitten checklist supplies first week'},
            {title: '🤝 Introduce a New Cat',       href: '/how-to-introduce-a-new-cat',      desktop: true, keywords: 'introduce new cat resident cat how to step by step scent swapping feliway hissing fighting timeline'},
            {title: '🦷 Why Cats Bite Gently',    href: '/why-does-my-cat-bite-me-gently',  desktop: true, keywords: 'cat bite gently why love bite nibble lick overstimulation play aggression grooming communication'},
            {title: '😴 Why Cats Sleep on You',   href: '/why-does-my-cat-sleep-on-me',     desktop: true, keywords: 'cat sleep on me why chest lap trust vulnerable purr heartbeat position breed'},
            {title: '📦 Why Cats Love Boxes',     href: '/why-do-cats-love-boxes',           desktop: true, keywords: 'cat love boxes why cardboard hide safe thermoregulation stress cortisol ambush predator'},
            {title: '🚪 Cat Follows You to the Bathroom', href: '/why-does-my-cat-follow-me-to-the-bathroom', desktop: true, keywords: 'cat follow bathroom toilet why door closed territory routine paw under door'}
        ],
        behavior: [
            {title: '🐕 Head Tilt Science',         href: '/why-does-my-dog-tilt-its-head',   desktop: true, keywords: 'dog tilt head behavior why study science'},
            {title: '🌿 Why Dogs Eat Grass',         href: '/why-do-dogs-eat-grass',            desktop: true, keywords: 'dog eat grass behavior why sick vomit'},
            {title: '💩 Why Dogs Eat Poop',          href: '/why-do-dogs-eat-poop',             desktop: true, keywords: 'dog eat poop coprophagia feces why behavior stop stool eating'},
            {title: '👣 Why Dogs Follow You',        href: '/why-do-dogs-follow-you-everywhere', desktop: true, keywords: 'dog follow everywhere clingy velcro shadow behavior'},
            {title: '🦨 Why Dogs Roll in Smelly Things', href: '/why-do-dogs-roll-in-smelly-things', desktop: true, keywords: 'dog roll dead things smelly gross behavior scent camouflage'},
            {title: '👀 Why Dogs Stare at You',       href: '/why-does-my-dog-stare-at-me',   desktop: true, keywords: 'dog stare at me why gazing behavior oxytocin love eye contact bond'},
            {title: '🦮 Why Dogs Wag Their Tails',    href: '/why-do-dogs-wag-their-tails',   desktop: true, keywords: 'dog wag tail why communication happy excited left right asymmetry'},
            {title: '🐾 Why Cats Knead',             href: '/why-does-my-cat-knead-me',        desktop: true, keywords: 'cat knead behavior why biscuits paws kneading'},
            {title: '🌙 Midnight Zoomies',           href: '/why-does-my-cat-go-crazy-at-night', desktop: true, keywords: 'cat night crazy zoomies 3am sprint parkour witching hour crepuscular frenetic random activity'},
            {title: '🪅 Cats Knock Things Over',     href: '/why-do-cats-knock-things-off-tables', desktop: true, keywords: 'cat knock things off table behavior why'},
            {title: '😴 Why Cats Sleep So Much',     href: '/why-do-cats-sleep-so-much',         desktop: true, keywords: 'cat sleep so much why hours polyphasic REM lethargy nap normal'},
            {title: '🦶 Why Dogs Lick Your Feet',    href: '/why-does-my-dog-lick-my-feet',      desktop: true, keywords: 'dog lick feet why behavior sweat salt vomeronasal pheromone compulsive'},
            {title: '🐺 Why Dogs Howl',              href: '/why-do-dogs-howl',                 desktop: true, keywords: 'dog howl why siren separation anxiety husky hound singing pack communication'}
        ],
        health: [
            {title: '🦷 Dog Dental Care Guide',     href: '/dog-dental-care-guide',           desktop: true, keywords: 'dog dental care teeth brushing cleaning vet extraction gum disease'},
            {title: '🐱 Cat Dental Care Guide',     href: '/cat-dental-care-guide',           desktop: true, keywords: 'cat dental care teeth brushing cleaning vet extraction stomatitis tooth resorption FORL gum disease'},
            {title: '👂 How to Clean Dog Ears',     href: '/how-to-clean-dog-ears',           desktop: true, keywords: 'clean dog ears infection wax how to safe without hurting'},
            {title: '😰 Separation Anxiety Protocol', href: '/separation-anxiety-in-dogs',    desktop: true, keywords: 'separation anxiety dog protocol desensitization training destructive behavior'},
            {title: '📢 Stop Excessive Barking',    href: '/how-to-stop-dog-barking',          desktop: true, keywords: 'stop dog barking excessive why fix source training no shock collar'},
            {title: '🦮 Leash Training: Stop Pulling', href: '/leash-training-pulling-dog',   desktop: true, keywords: 'leash training pulling dog stop 7 days tree u-turn method'},
            {title: '☀️ Summer Dog Safety',          href: '/summer-dog-safety',                desktop: true, keywords: 'summer dog safety hot pavement heatstroke prevention paws water'},
            {title: '🎆 Calm Dog During Fireworks',  href: '/calm-dog-during-fireworks',        desktop: true, keywords: 'calm dog fireworks july 4th safe room noise phobia desensitization'},
            {title: '🐕 Dog Park Etiquette',        href: '/dog-park-etiquette',               desktop: true, keywords: 'dog park etiquette rules norms behavior first visit'},
            {title: '✂️ DIY vs Pro Grooming',       href: '/diy-dog-grooming-vs-professional', desktop: true, keywords: 'diy dog grooming vs professional cost clippers breed guide doodle double coat shave'},
            {title: '🐶 New Puppy Checklist',       href: '/new-puppy-checklist',              desktop: true, keywords: 'new puppy checklist supplies what you need first week'},
            {title: '🤮 Cat Vomiting Color Guide',  href: '/cat-vomiting-color-guide',         desktop: true, keywords: 'cat vomiting vomit color yellow bile white foam brown red blood when to worry emergency hairball'},
            {title: '🫘 Cat Kidney Disease Prevention', href: '/cat-kidney-disease-prevention',desktop: true, keywords: 'cat kidney disease CKD chronic renal failure prevention hydration SDMA creatinine wet food phosphorus'}
        ],
        costs: [
            {title: '💰 Monthly Pet Cost Calculator', href: '/monthly-pet-cost',              desktop: true, keywords: 'cost calculator monthly pet food vet insurance grooming'},
            {title: '🍖 Dog Food Cost Calculator',   href: '/dog-food-cost-calculator',        desktop: true, keywords: 'dog food cost calculator monthly annual kibble wet raw dry food budget'},
            {title: '💵 How Much Does a Dog Cost Per Month', href: '/how-much-does-a-dog-cost-per-month', desktop: true, keywords: 'dog cost per month food vet insurance small medium large'},
            {title: '⚖️ Adopt vs Buy',              href: '/adopt-vs-buy',                    desktop: true, keywords: 'adopt buy cost comparison shelter breeder calculator'},
            {title: '📊 Adopt vs Buy: Full Breakdown', href: '/adopt-vs-buy-full-cost-breakdown', desktop: true, keywords: 'adopt vs buy full cost breakdown health temperament lifetime comparison'},
            {title: '💸 17 Hidden Costs of Ownership', href: '/hidden-costs-of-dog-ownership', desktop: true, keywords: 'hidden costs dog ownership emergency boarding allergy shots destroyed drywall'},
            {title: '🧾 First Year Dog Cost: $5,237', href: '/first-year-dog-cost',            desktop: true, keywords: 'first year dog cost real receipt tracked expenses puppy supplies'},
            {title: '💵 Pet Insurance Worth It?',    href: '/pet-insurance-worth-it',           desktop: true, keywords: 'pet insurance worth it 2026 cost premium vs out of pocket real scenarios'},
            {title: '🍖 Best Dog Food Guide',        href: '/best-dog-food-dry-vs-wet-vs-raw',  desktop: true, keywords: 'best dog food dry vs wet vs raw kibble comparison nutrition label'},
            {title: '🦴 Best Indestructible Dog Toys', href: '/best-indestructible-dog-toys',   desktop: true, keywords: 'best indestructible dog toys heavy chewers durable rubber nylon kong goughnuts benebone'},
            {title: '🐱 Best Cat Litter Comparison',  href: '/best-cat-litter-comparison',       desktop: true, keywords: 'best cat litter clumping crystal clay natural silica comparison'}
        ],
        info: [
            {title: 'About MeltPet',                href: '/about',                           desktop: false, keywords: 'about meltpet contact story founder pet food experience'},
            {title: 'Privacy Policy',               href: '/privacy',                         desktop: false, keywords: 'privacy policy cookies tracking data'},
            {title: '🗺️ Sitemap',                  href: '/sitemap-page',                    desktop: false, keywords: 'sitemap all pages index directory'},
            {title: '👩‍🔬 Sarah Mitchell — Author',     href: '/sarah-mitchell',                  desktop: false, keywords: 'sarah mitchell author pet food researcher meltpet credentials bio'}
        ]
    };

    // ── Build Desktop Navigation (injected into #nav-container) ──
    function buildDesktopNav() {
        var container = document.getElementById('nav-container');
        if (!container) return;

        var dropdowns = {
            tools: 'Tools ▾',
            breeds: 'Breeds ▾',
            behavior: 'Behavior ▾',
            health: 'Health & Training ▾',
            costs: 'Costs ▾'
        };

        var html = '<nav class="site-nav" aria-label="Main Navigation"><div class="nav-inner">';
        html += '<a href="/" class="nav-brand">Melt<span>Pet</span></a>';
        html += '<div class="nav-links">';

        ['tools', 'breeds', 'behavior', 'health', 'costs'].forEach(function(key) {
            html += '<div class="nav-dropdown"><button type="button" class="nav-dropdown-toggle" aria-haspopup="true" aria-expanded="false">' + dropdowns[key] + '</button><div class="nav-dropdown-menu">';
            var items = key === 'breeds' ? NAV_SECTIONS.dogs.concat(NAV_SECTIONS.cats) : NAV_SECTIONS[key];
            items.forEach(function(item) {
                if (item.desktop === false) return;
                html += '<a href="' + item.href + '">' + item.title + '</a>';
            });
            html += '</div></div>';
        });

        html += '</div>'; // nav-links

        html += '<div class="nav-actions">';
        html += '<input type="search" class="nav-search" placeholder="Search..." aria-label="Search MeltPet" id="nav-search-input">';
        html += '<button class="btn-theme" id="btn-theme" title="Toggle dark/light mode" aria-label="Toggle dark mode">☽</button>';
        html += '</div>'; // nav-actions

        html += '</div></nav>';
        container.innerHTML = html;
    }

    // ── Mobile Nav ──
    function buildMobileNav() {
        var sectionLabels = {tools: 'Tools', dogs: 'Dogs', cats: 'Cats', behavior: 'Behavior', health: 'Health & Training', costs: 'Costs', info: 'Info'};
        var navHTML = '<button class="mobile-nav-close" aria-label="Close menu">✕</button>';
        ['tools', 'dogs', 'cats', 'behavior', 'health', 'costs', 'info'].forEach(function(key) {
            navHTML += '<div class="mobile-nav-section">' + sectionLabels[key] + '</div>';
            NAV_SECTIONS[key].forEach(function(item) {
                navHTML += '<a href="' + item.href + '">' + item.title + '</a>';
            });
        });
        navHTML += '<a href="/">🏠 Home</a>';

        // Create hamburger button
        var hamburger = document.createElement('button');
        hamburger.className = 'hamburger';
        hamburger.setAttribute('aria-label', 'Toggle navigation menu');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.innerHTML = '<span></span><span></span><span></span>';

        // Create overlay
        var overlay = document.createElement('div');
        overlay.className = 'mobile-nav-overlay';

        // Create panel
        var panel = document.createElement('div');
        panel.className = 'mobile-nav-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Navigation menu');
        panel.innerHTML = navHTML;

        function open() {
            hamburger.classList.add('active');
            overlay.classList.add('open');
            panel.classList.add('open');
            document.body.classList.add('mobile-nav-open');
            hamburger.setAttribute('aria-expanded', 'true');
        }
        function close() {
            hamburger.classList.remove('active');
            overlay.classList.remove('open');
            panel.classList.remove('open');
            document.body.classList.remove('mobile-nav-open');
            hamburger.setAttribute('aria-expanded', 'false');
        }

        hamburger.addEventListener('click', function() {
            if (panel.classList.contains('open')) { close(); } else { open(); }
        });
        overlay.addEventListener('click', close);
        panel.querySelector('.mobile-nav-close').addEventListener('click', close);

        // Insert hamburger into nav actions
        var navActions = document.querySelector('.nav-actions');
        if (navActions) {
            navActions.insertBefore(hamburger, navActions.firstChild);
        }
        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        // Close on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && panel.classList.contains('open')) { close(); }
        });
    }

    // ── Client-Side Search (built from NAV_SECTIONS) ──
    var SEARCH_INDEX = (function() {
        var flat = [];
        Object.keys(NAV_SECTIONS).forEach(function(section) {
            NAV_SECTIONS[section].forEach(function(item) {
                flat.push({
                    title: item.title,
                    href: item.href,
                    keywords: item.keywords
                });
            });
        });
        return flat;
    })();

    function setupSearch() {
        var searchInput = document.getElementById('nav-search-input');
        if (!searchInput) return;

        // Wrap input for relative positioning
        var wrapper = document.createElement('span');
        wrapper.className = 'nav-search-wrap';
        searchInput.parentNode.insertBefore(wrapper, searchInput);
        wrapper.appendChild(searchInput);

        // Create results dropdown
        var dropdown = document.createElement('div');
        dropdown.className = 'search-results';
        wrapper.appendChild(dropdown);

        var blurTimer;

        function doSearch(q) {
            q = q.toLowerCase().trim();
            dropdown.innerHTML = '';
            if (q.length < 2) { dropdown.classList.remove('active'); return; }

            var results = [];
            SEARCH_INDEX.forEach(function(item) {
                var score = 0;
                var titleLower = item.title.toLowerCase();
                var kwLower = item.keywords.toLowerCase();
                if (titleLower.indexOf(q) !== -1) score += 10;
                var words = titleLower.split(/\s+/);
                words.forEach(function(w) { if (w.indexOf(q) === 0) score += 5; });
                if (kwLower.indexOf(q) !== -1) score += 3;
                if (score > 0) results.push({item: item, score: score});
            });

            results.sort(function(a, b) { return b.score - a.score; });

            if (results.length === 0) {
                dropdown.innerHTML = '<div class="search-no-result">No results — try a different term</div>';
            } else {
                results.forEach(function(r) {
                    var title = r.item.title;
                    var idx = title.toLowerCase().indexOf(q);
                    if (idx !== -1) {
                        title = title.substring(0, idx) + '<strong>' + title.substring(idx, idx + q.length) + '</strong>' + title.substring(idx + q.length);
                    }
                    var a = document.createElement('a');
                    a.href = r.item.href;
                    a.innerHTML = title;
                    dropdown.appendChild(a);
                });
            }
            dropdown.classList.add('active');
        }

        searchInput.addEventListener('input', function() {
            doSearch(this.value);
        });

        searchInput.addEventListener('focus', function() {
            if (this.value.length >= 2) doSearch(this.value);
        });

        searchInput.addEventListener('blur', function() {
            blurTimer = setTimeout(function() { dropdown.classList.remove('active'); }, 200);
        });

        dropdown.addEventListener('mousedown', function(e) {
            clearTimeout(blurTimer);
            if (e.target.tagName === 'A') {
                dropdown.classList.remove('active');
            }
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (!dropdown.classList.contains('active') || !dropdown.querySelector('a')) {
                    window.location = 'https://www.google.com/search?q=site:meltpet.com+' + encodeURIComponent(this.value);
                } else {
                    var first = dropdown.querySelector('a');
                    if (first) { e.preventDefault(); first.click(); }
                }
            }
            if (e.key === 'Escape') {
                dropdown.classList.remove('active');
            }
        });

        // Close on outside click
        document.addEventListener('click', function(e) {
            if (!wrapper.contains(e.target)) { dropdown.classList.remove('active'); }
        });
    }

    // ── BreadcrumbList JSON-LD (reads visual .breadcrumb, injects structured data) ──
    function injectBreadcrumbList() {
        var bc = document.querySelector('.breadcrumb');
        if (!bc) return;

        var items = [];
        var anchors = bc.querySelectorAll('a');
        var current = bc.querySelector('.current');

        anchors.forEach(function(a, i) {
            // Strip emoji + non-ASCII, then trim
            var name = a.textContent.replace(/[^\x20-\x7E]/g, '').trim();
            if (!name) return;
            items.push({
                '@type': 'ListItem',
                position: items.length + 1,
                name: name,
                item: a.href
            });
        });

        if (current) {
            var name = current.textContent.replace(/[^\x20-\x7E]/g, '').trim();
            if (name) {
                items.push({
                    '@type': 'ListItem',
                    position: items.length + 1,
                    name: name,
                    item: window.location.href
                });
            }
        }

        if (items.length < 2) return; // BreadcrumbList needs at least 2 items

        var script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': items
        });
        document.head.appendChild(script);
    }

    // ── Init ──
    function init() {
        buildDesktopNav();
        buildMobileNav();
        setupSearch();
        injectBreadcrumbList();

        var btn = document.getElementById('btn-theme');
        if (btn) { btn.addEventListener('click', toggleTheme); }
        updateThemeIcon();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
})();
