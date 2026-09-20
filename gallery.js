/* ============================================================================
 * MeltPet — Pin Gallery 前端
 * ----------------------------------------------------------------------------
 * 设计约束（都是硬约束，改之前先读）：
 *  1. **绝不把服务端/用户内容塞进 innerHTML**。标题、描述、评论正文、标签全部
 *     走 textContent / createElement。免注册评论 + UGC + CSP 只有 'unsafe-inline'，
 *     一次 innerHTML 拼接就是一个存储型 XSS。
 *  2. **图片一律带 width/height**。瀑布流靠 column-count 排版，图片没有固有尺寸
 *     会导致移动端反复重排（CLS 直接爆掉）。
 *  3. **列数不用写死**。用 CSS 里的 column-count 断点控制 —— 本站历史上
 *     写死的 `repeat(4,1fr)` 正是移动端撑破视口的三个成因之一。
 *  4. API 不可用时（GitHub Pages 镜像没有 Functions）**必须优雅降级**：
 *     显示一条说明 + 空状态，不能白屏、不能一堆 broken image。
 * ========================================================================== */
(function () {
  'use strict';

  var API = '/api';
  var PAGE_SIZE = 24;
  // 单次浏览最多上报多少个观看 —— 防止长页面滚动时打出一串 POST
  var VIEW_REPORT_CAP = 40;

  var state = {
    theme: '',
    species: '',
    tag: '',
    sort: 'recent',
    offset: 0,
    total: 0,
    items: [],
    hasMore: false,
    loading: false,
    apiDown: false,
    viewed: {},
    viewReports: 0,
    labels: { theme: {}, species: {} },
  };

  var els = {};
  var $ = function (id) { return document.getElementById(id); };

  // ── 本地互动状态（无账号体系，所以「我点过赞」只存本机）──────────────────
  var LS_LIKED = 'meltpet.pin.liked';
  var LS_SAVED = 'meltpet.pin.saved';

  function readSet(key) {
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeSet(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr.slice(-500))); } catch (e) { /* 隐私模式下静默 */ }
  }
  var liked = new Set(readSet(LS_LIKED));
  var saved = new Set(readSet(LS_SAVED));
  function persistLiked() { writeSet(LS_LIKED, Array.from(liked)); }
  function persistSaved() { writeSet(LS_SAVED, Array.from(saved)); }

  // ── 工具 ──────────────────────────────────────────────────────────────────
  function api(path, options) {
    var opts = options || {};
    var init = { method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(API + path, init).then(function (res) {
      var ctype = res.headers.get('content-type') || '';
      if (ctype.indexOf('application/json') === -1) {
        // 镜像站会把 /api/... 当成未知路径返回 HTML —— 这正是「后端不存在」的信号
        var err = new Error('api_unavailable');
        err.code = 'api_unavailable';
        throw err;
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          var e = new Error((data.error && data.error.message) || 'Request failed.');
          e.code = (data.error && data.error.code) || 'error';
          e.status = res.status;
          e.retryAfter = data.error && data.error.retryAfter;
          throw e;
        }
        return data;
      });
    });
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  function relTime(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    var secs = Math.floor((Date.now() - t) / 1000);
    if (secs < 60) return 'just now';
    var mins = Math.floor(secs / 60);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    var months = Math.floor(days / 30);
    if (months < 12) return months + 'mo ago';
    return Math.floor(months / 12) + 'y ago';
  }

  function prettyTag(t) { return String(t).replace(/-/g, ' '); }

  function notice(msg, kind) {
    els.notice.textContent = msg;
    els.notice.className = 'pin-notice' + (kind ? ' is-' + kind : '');
    els.notice.hidden = !msg;
  }

  function updateUrl() {
    var p = new URLSearchParams();
    if (state.theme) p.set('theme', state.theme);
    if (state.species) p.set('species', state.species);
    if (state.tag) p.set('tag', state.tag);
    if (state.sort !== 'recent') p.set('sort', state.sort);
    var qs = p.toString();
    // 🔴 必须把 #pin=<slug> 深链带上。历史实现写的是 location.pathname + search，
    //    replaceState 会把 hash 一起抹掉 —— 结果弹层还开着，但地址栏的深链没了，
    //    用户此刻复制链接得到的是一个不指向这张图的 URL。
    var hash = location.hash.indexOf('#pin=') === 0 ? location.hash : '';
    var url = location.pathname + (qs ? '?' + qs : '') + hash;
    try { history.replaceState(null, '', url); } catch (e) { /* file:// 下会抛，忽略 */ }
  }

  function readUrl() {
    var p = new URLSearchParams(location.search);
    state.theme = p.get('theme') || '';
    state.species = p.get('species') || '';
    state.tag = p.get('tag') || '';
    var s = p.get('sort');
    state.sort = (s === 'popular' || s === 'saved') ? s : 'recent';
    if (els.sortSelect) els.sortSelect.value = state.sort;
  }

  // ── 筛选栏 ────────────────────────────────────────────────────────────────

  /**
   * 渲染一组筛选 chip。
   * @param {HTMLElement} host
   * @param {string} key state 里的键名
   * @param {Array<{value:string,count:number,label:string}>} options
   */
  function renderChips(host, key, options) {
    host.textContent = '';
    options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pin-chip' + (state[key] === opt.value ? ' is-active' : '');
      btn.setAttribute('aria-pressed', state[key] === opt.value ? 'true' : 'false');
      btn.dataset.value = opt.value;
      var label = document.createElement('span');
      label.className = 'pin-chip-label';
      label.textContent = opt.label;
      var count = document.createElement('span');
      count.className = 'pin-chip-count';
      count.textContent = fmtNum(opt.count);
      btn.appendChild(label);
      btn.appendChild(count);
      btn.addEventListener('click', function () {
        state[key] = state[key] === opt.value ? '' : opt.value;
        state.offset = 0;
        updateUrl();
        renderChips(host, key, options);
        refreshTagRow();
        loadFeed(true);
      });
      host.appendChild(btn);
    });
  }

  function refreshTagRow() {
    if (!els.tagRow) return;
    els.tagRow.hidden = !els.tagChips.children.length;
  }

  function buildFilterControls(tax) {
    if (tax.labels) state.labels = tax.labels;
    var themeOpts = (tax.theme || []).map(function (t) {
      return {
        value: t.value,
        count: t.count,
        label: (state.labels.theme && state.labels.theme[t.value]) || t.value,
      };
    });
    var speciesOpts = (tax.species || []).map(function (s) {
      return {
        value: s.value,
        count: s.count,
        label: (state.labels.species && state.labels.species[s.value]) || s.value,
      };
    });
    // 「全部」chip 常驻，否则清空筛选要另外找按钮
    themeOpts.unshift({ value: '', count: tax.totals ? tax.totals.posts : 0, label: 'All themes' });
    // ⚠️ 这里必须用 totals.posts，不能把 species 分组的 count 相加：
    // species='both' 的作品会**同时**落在 dogs 和 cats 两组里，
    // 相加会把它算两次（实测 2 条记录显示成 3），与「All themes」口径也对不上。
    speciesOpts.unshift({
      value: '',
      count: tax.totals ? tax.totals.posts : 0,
      label: 'All pets',
    });
    renderChips(els.themeChips, 'theme', themeOpts);
    renderChips(els.speciesChips, 'species', speciesOpts);

    var tags = tax.tags || [];
    els.tagChips.textContent = '';
    if (state.tag) {
      // 选中的标签可能不在 top40 里，补一个进去，避免它「消失」
      if (!tags.some(function (t) { return t.value === state.tag; })) {
        tags = [{ value: state.tag, count: 0 }].concat(tags);
      }
    }
    tags.slice(0, 24).forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pin-chip pin-chip-sm' + (state.tag === t.value ? ' is-active' : '');
      btn.dataset.value = t.value;
      // 主题/宠物 chip 有 aria-pressed，标签 chip 也必须有 ——
      // 否则屏幕阅读器用户听不出当前选中了哪个标签（纯视觉的 is-active 对它无效）
      btn.setAttribute('aria-pressed', state.tag === t.value ? 'true' : 'false');
      btn.textContent = '#' + prettyTag(t.value);
      btn.addEventListener('click', function () {
        state.tag = state.tag === t.value ? '' : t.value;
        state.offset = 0;
        updateUrl();
        loadTaxonomy().then(function () { loadFeed(true); });
      });
      els.tagChips.appendChild(btn);
    });
    refreshTagRow();

    var active = !!(state.theme || state.species || state.tag || state.sort !== 'recent');
    els.resetBtn.hidden = !active;
  }

  // ── 瀑布流卡片 ────────────────────────────────────────────────────────────

  function buildCard(post) {
    var card = document.createElement('article');
    card.className = 'pin-card';
    card.dataset.slug = post.slug;
    // 容器是 role="list"，卡片必须声明 listitem，否则列表结构不完整
    card.setAttribute('role', 'listitem');

    var media = document.createElement('button');
    media.type = 'button';
    media.className = 'pin-card-media';
    media.setAttribute('aria-label', 'Open ' + post.title);

    var img = document.createElement('img');
    img.src = post.imageUrl;
    img.alt = post.imageAlt || post.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    // 有真实尺寸就写上（防 CLS）；没有就退回 2:3 的固定比例
    if (post.imageW && post.imageH) {
      img.width = post.imageW;
      img.height = post.imageH;
    } else {
      img.width = 1000;
      img.height = 1500;
    }
    img.addEventListener('error', function () {
      // 图挂了要显示占位而不是破图图标
      card.classList.add('is-broken');
      img.remove();
      var ph = document.createElement('span');
      ph.className = 'pin-card-placeholder';
      ph.textContent = 'Image unavailable';
      media.appendChild(ph);
    });
    media.appendChild(img);

    var overlay = document.createElement('span');
    overlay.className = 'pin-card-overlay';
    var saveMini = document.createElement('span');
    saveMini.className = 'pin-card-save';
    saveMini.textContent = saved.has(post.slug) ? 'Saved' : 'Save';
    overlay.appendChild(saveMini);
    media.appendChild(overlay);

    media.addEventListener('click', function () { openModal(post.slug); });

    var body = document.createElement('div');
    body.className = 'pin-card-body';

    // h3 而不是 h2：板块已经有 sr-only 的 h2「Pins」，
    // 24 张卡片若都用 h2 会把文档大纲冲成 24 个并列顶级标题。
    var title = document.createElement('h3');
    title.className = 'pin-card-title';
    title.textContent = post.title;
    body.appendChild(title);

    if (post.description) {
      var desc = document.createElement('p');
      desc.className = 'pin-card-desc';
      desc.textContent = post.description.length > 130 ? post.description.slice(0, 127) + '…' : post.description;
      body.appendChild(desc);
    }

    var meta = document.createElement('p');
    meta.className = 'pin-card-meta';
    var bits = [];
    if (state.labels.theme && state.labels.theme[post.theme]) bits.push(state.labels.theme[post.theme]);
    if (state.labels.species && state.labels.species[post.species]) bits.push(state.labels.species[post.species]);
    meta.textContent = bits.join(' · ');
    if (bits.length) body.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'pin-card-actions';

    var likeBtn = document.createElement('button');
    likeBtn.type = 'button';
    likeBtn.className = 'pin-mini' + (liked.has(post.slug) ? ' is-active' : '');
    likeBtn.setAttribute('aria-pressed', liked.has(post.slug) ? 'true' : 'false');
    likeBtn.title = 'Like';
    likeBtn.appendChild(document.createTextNode('♥ '));
    likeBtn.appendChild(document.createTextNode(fmtNum(post.likes)));
    likeBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggle('like', post.slug, likeBtn, null, 'likes');
    });
    actions.appendChild(likeBtn);

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'pin-mini' + (saved.has(post.slug) ? ' is-active' : '');
    saveBtn.setAttribute('aria-pressed', saved.has(post.slug) ? 'true' : 'false');
    saveBtn.title = 'Save';
    saveBtn.appendChild(document.createTextNode('🔖 '));
    saveBtn.appendChild(document.createTextNode(fmtNum(post.saves)));
    saveBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggle('save', post.slug, saveBtn, null, 'saves');
    });
    actions.appendChild(saveBtn);

    var views = document.createElement('span');
    views.className = 'pin-mini pin-mini-static';
    views.textContent = '👁 ' + fmtNum(post.views);
    actions.appendChild(views);

    if (post.linkUrl) {
      var go = document.createElement('a');
      go.className = 'pin-mini pin-mini-link';
      go.href = post.linkUrl;
      go.textContent = post.linkLabel || 'Open →';
      // 站外链接交给 analytics.js 的 outbound_click 统一埋点，这里不重复处理
      if (/^https?:/i.test(post.linkUrl)) {
        go.target = '_blank';
        go.rel = 'noopener';
      }
      actions.appendChild(go);
    }

    body.appendChild(actions);
    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  var viewObserver = null;
  function observeViews(host) {
    if (!('IntersectionObserver' in window)) return;
    if (!viewObserver) {
      viewObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var card = entry.target;
          viewObserver.unobserve(card);
          var slug = card.dataset.slug;
          if (!slug || state.viewed[slug]) return;
          if (state.viewReports >= VIEW_REPORT_CAP) return;
          state.viewed[slug] = true;
          state.viewReports++;
          api('/posts/' + encodeURIComponent(slug) + '/view', { method: 'POST' }).then(function (r) {
            var el = card.querySelector('.pin-mini-static');
            if (el && r && typeof r.views === 'number') el.textContent = '👁 ' + fmtNum(r.views);
          }).catch(function () { /* 观看数失败不影响浏览 */ });
        });
      }, { rootMargin: '200px 0px' });
    }
    Array.prototype.forEach.call(host.querySelectorAll('.pin-card'), function (c) { viewObserver.observe(c); });
  }

  // ── 信息流加载 ────────────────────────────────────────────────────────────

  function loadFeed(reset) {
    if (state.loading) {
      // 🔴 加载中又来了请求（用户手快，连点两个筛选 chip）：
      //    旧的实现直接 return，把这次点击**静默吞掉** —— 表现为「点了没反应」，
      //    而筛选项已经变了、地址栏也变了，界面和状态开始对不上。
      //    改成记一个待办，本轮结束后补跑一次。只要是 reset 就一定要重跑（不能降级成 append）。
      state.pendingReset = state.pendingReset || !!reset;
      return;
    }
    state.loading = true;
    if (reset) {
      state.offset = 0;
      els.masonry.textContent = '';
    }
    els.moreBtn.disabled = true;
    els.moreBtn.textContent = 'Loading…';

    var p = new URLSearchParams();
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(state.offset));
    p.set('sort', state.sort);
    if (state.theme) p.set('theme', state.theme);
    if (state.species) p.set('species', state.species);
    if (state.tag) p.set('tag', state.tag);

    api('/feed?' + p.toString())
      .then(function (data) {
        state.apiDown = false;
        state.total = data.total || 0;
        state.hasMore = !!data.hasMore;
        state.offset = data.nextOffset || state.offset + PAGE_SIZE;
        if (data.labels) state.labels = data.labels;

        var frag = document.createDocumentFragment();
        (data.items || []).forEach(function (post) {
          frag.appendChild(buildCard(post));
        });
        els.masonry.appendChild(frag);
        observeViews(els.masonry);

        els.empty.hidden = !(state.total === 0 && els.masonry.children.length === 0);
        if (!els.empty.hidden) {
          els.emptyHint.textContent = (state.theme || state.species || state.tag)
            ? 'Nothing on this board matches that filter yet. Try clearing it.'
            : 'No pins have been published yet. Check back soon.';
        }
        els.moreBtn.hidden = !state.hasMore;

        // 顶部统计行
        els.stats.hidden = false;
        els.stats.textContent = state.total + (state.total === 1 ? ' pin' : ' pins') + ' on this board';
      })
      .catch(function (err) {
        if (err && err.code === 'api_unavailable') {
          degradeToReadOnly();
        } else {
          notice('Could not load pins: ' + (err && err.message ? err.message : 'unknown error'), 'error');
        }
      })
      .finally(function () {
        state.loading = false;
        els.moreBtn.disabled = false;
        els.moreBtn.textContent = 'Load more pins';
        // 补跑被吞掉的那次刷新（先清标记再递归，否则会无限循环）
        if (state.pendingReset) {
          state.pendingReset = false;
          loadFeed(true);
        }
      });
  }

  /**
   * 后端不存在时的降级路径。
   * GitHub Pages 镜像（meltpet.github.io/meltpet.com/）没有 Functions，
   * 静态托管还会把 /api/feed 当作未知路径返回 200 + HTML —— 所以判据是
   * 「响应不是 JSON」，而不是 HTTP 状态码。
   */
  function degradeToReadOnly() {
    state.apiDown = true;
    notice(
      'The pin board needs its backend, which is not available on this mirror. '
      + 'Open www.meltpet.com/gallery for the full gallery.',
      'warn',
    );
    els.empty.hidden = false;
    els.emptyHint.textContent = 'This mirror has no backend, so the board cannot load here.';
    els.moreBtn.hidden = true;
    els.filters.hidden = true;
    els.stats.hidden = true;
  }

  function loadTaxonomy() {
    return api('/taxonomy')
      .then(function (tax) {
        buildFilterControls(tax);
        return tax;
      })
      .catch(function (err) {
        if (err && err.code === 'api_unavailable') degradeToReadOnly();
        return null;
      });
  }

  // ── 点赞 / 收藏 ───────────────────────────────────────────────────────────

  /**
   * @param {'like'|'save'} kind
   * @param {string} slug
   * @param {HTMLElement} btn          触发按钮（用于乐观更新）
   * @param {HTMLElement|null} modalBtn 弹层里对应的按钮
   * @param {'likes'|'saves'} field     响应里的计数字段
   */
  function toggle(kind, slug, btn, modalBtn, field) {
    var set = kind === 'like' ? liked : saved;
    var want = !set.has(slug);

    // 乐观更新：先动 UI，失败再回滚。网络往返期间按钮必须有反馈。
    applyLocalState(kind, slug, want, btn, modalBtn, null);

    api('/posts/' + encodeURIComponent(slug) + '/' + kind, { method: 'POST', body: { on: want } })
      .then(function (r) {
        applyLocalState(kind, slug, !!r.active, btn, modalBtn, r[field]);
      })
      .catch(function (err) {
        set.delete(slug);
        applyLocalState(kind, slug, !want, btn, modalBtn, null);
        if (err && err.code === 'api_unavailable') {
          degradeToReadOnly();
        } else if (err && err.code === 'rate_limited') {
          notice('Too many clicks — give it a moment.', 'warn');
        } else {
          notice('Could not save that: ' + (err && err.message ? err.message : 'unknown error'), 'error');
        }
      });
  }

  function applyLocalState(kind, slug, active, btn, modalBtn, count) {
    var set = kind === 'like' ? liked : saved;
    if (active) set.add(slug); else set.delete(slug);
    if (kind === 'like') persistLiked(); else persistSaved();

    [btn, modalBtn].forEach(function (b) {
      if (!b) return;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (typeof count === 'number') {
      var countEl = btn && btn.querySelector('.pin-mini-count');
      if (btn) {
        // 卡片上的按钮结构是「♥ 12」，文字节点第 2 个是数字
        var nodes = btn.childNodes;
        for (var i = nodes.length - 1; i >= 0; i--) {
          if (nodes[i].nodeType === 3) { nodes[i].nodeValue = fmtNum(count); break; }
        }
      }
      if (countEl) countEl.textContent = fmtNum(count);
    }
    // 弹层按钮的计数元素
    if (kind === 'like' && els.likeCount && typeof count === 'number') els.likeCount.textContent = fmtNum(count);
    if (kind === 'save' && els.saveCount && typeof count === 'number') els.saveCount.textContent = fmtNum(count);
  }

  // ── 弹层 ──────────────────────────────────────────────────────────────────

  var modalState = { slug: '', post: null };
  // 打开弹层前焦点在哪，关闭时要还回去（键盘用户否则会被丢回页面顶部）
  var lastFocused = null;

  /** 弹层内当前可聚焦的可见元素。 */
  function focusables(root) {
    var sel = 'a[href], button:not([disabled]), input:not([disabled]), '
      + 'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(root.querySelectorAll(sel), function (el) {
      return !el.hidden && el.offsetParent !== null;
    });
  }

  /**
   * 弹层的键盘行为。
   *
   * 🔴 为什么必须自己做：`aria-modal="true"` 只是**声明**，浏览器不会因此
   *    把 Tab 关在弹层里。没有这段代码，键盘用户按几下 Tab 就跑到背后
   *    那 24 张卡片上了，而视觉上他还在弹层里 —— 这是真正的「看不见的陷阱」。
   */
  function onModalKeydown(ev) {
    if (els.modal.hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); closeModal(); return; }
    if (ev.key !== 'Tab' || !els.modalCard) return;
    var list = focusables(els.modalCard);
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    // 焦点在对话框本体上（就是刚打开时的状态，tabindex="-1"）：
    // 它**不在 Tab 序列里**，交给浏览器就等于「跳到弹层外面」——
    // 尤其 Shift+Tab，会去找 DOM 里它前面的可聚焦元素，也就是背景那 24 张卡。
    // 所以这一档必须自己接住。写这段时是靠断言才发现的（原生行为反直觉）。
    if (active === els.modalCard) {
      ev.preventDefault();
      (ev.shiftKey ? last : first).focus();
      return;
    }
    if (ev.shiftKey) {
      // Shift+Tab 在第一个元素（或焦点已丢到弹层外）时绕回最后一个
      if (active === first || !els.modalCard.contains(active)) { ev.preventDefault(); last.focus(); }
    } else if (active === last || !els.modalCard.contains(active)) {
      ev.preventDefault();
      first.focus();
    }
  }

  /** 找到某张卡片上的「打开」按钮 —— 焦点还原的目标。 */
  function triggerFor(slug) {
    var cards = document.querySelectorAll('.pin-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.slug === slug) return cards[i].querySelector('.pin-card-media');
    }
    return null;
  }

  function openModal(slug) {
    modalState.slug = slug;
    modalState.post = null;
    // 记下「从哪儿打开的」，关闭时把焦点还回去。
    // ⚠️ 不能只认 document.activeElement：深链（#pin=xxx 直接进页面）打开时
    //    焦点还在 body 上，body.focus() 等于没还原，键盘用户会被丢回页面开头。
    //    这种情况退回到按 slug 找到的卡片按钮。
    var active = document.activeElement;
    lastFocused = (active && active.focus && active !== document.body && active !== document.documentElement)
      ? active
      : triggerFor(slug);
    els.modal.hidden = false;
    document.body.classList.add('pin-modal-open');
    // 焦点移入对话框本体（tabindex="-1" + aria-labelledby，屏幕阅读器会念出标题）。
    // 不直接聚焦关闭按钮：那会让 SR 一开口就是 "Close"，听不出打开了什么。
    if (els.modalCard) { try { els.modalCard.focus(); } catch (e) { /* ignore */ } }
    els.modalImage.removeAttribute('src');
    els.modalTitle.textContent = 'Loading…';
    els.modalDesc.textContent = '';
    els.modalMeta.textContent = '';
    els.link.hidden = true;
    els.commentList.textContent = '';
    els.commentStatus.textContent = '';
    els.commentForm.reset();
    els.commentForm.dataset.startedAt = String(Date.now());

    try { history.replaceState(null, '', '#pin=' + encodeURIComponent(slug)); } catch (e) { /* ignore */ }

    api('/posts/' + encodeURIComponent(slug))
      .then(function (data) {
        fillModal(data.post, data.state);
        api('/posts/' + encodeURIComponent(slug) + '/comments')
          .then(function (c) { renderComments(c.comments || []); })
          .catch(function () { els.commentList.textContent = 'Comments could not be loaded.'; });
        return api('/posts/' + encodeURIComponent(slug) + '/view', { method: 'POST' });
      })
      .then(function (r) {
        if (r && typeof r.views === 'number') els.viewCount.textContent = fmtNum(r.views);
      })
      .catch(function (err) {
        if (err && err.code === 'api_unavailable') {
          closeModal();
          degradeToReadOnly();
        } else {
          els.modalTitle.textContent = 'Could not load that pin.';
          els.modalDesc.textContent = (err && err.message) || '';
        }
      });
  }

  function fillModal(post, interaction) {
    if (!post) return;
    modalState.post = post;
    els.modalImage.src = post.imageUrl;
    els.modalImage.alt = post.imageAlt || post.title;
    if (post.imageW && post.imageH) {
      els.modalImage.width = post.imageW;
      els.modalImage.height = post.imageH;
    }
    els.modalTitle.textContent = post.title;
    els.modalDesc.textContent = post.description || '';
    els.modalDesc.hidden = !post.description;

    var bits = [];
    if (state.labels.theme && state.labels.theme[post.theme]) bits.push(state.labels.theme[post.theme]);
    if (state.labels.species && state.labels.species[post.species]) bits.push(state.labels.species[post.species]);
    if (post.publishedAt) bits.push(relTime(post.publishedAt));
    els.modalMeta.textContent = bits.join(' · ');

    els.likeCount.textContent = fmtNum(post.likes);
    els.saveCount.textContent = fmtNum(post.saves);
    els.viewCount.textContent = fmtNum(post.views);
    els.commentCount.textContent = fmtNum(post.comments);

    // 本机记录优先，服务端状态兜底纠正
    if (interaction && interaction.liked) liked.add(post.slug);
    if (interaction && interaction.saved) saved.add(post.slug);
    if (interaction && interaction.liked === false && !liked.has(post.slug)) liked.delete(post.slug);
    persistLiked(); persistSaved();

    els.likeBtn.classList.toggle('is-active', liked.has(post.slug));
    els.saveBtn.classList.toggle('is-active', saved.has(post.slug));

    if (post.linkUrl) {
      els.link.href = post.linkUrl;
      els.link.textContent = post.linkLabel || 'Open the full guide';
      els.link.hidden = false;
      els.link.removeAttribute('target');
      els.link.removeAttribute('rel');
      if (/^https?:/i.test(post.linkUrl)) {
        els.link.target = '_blank';
        els.link.rel = 'noopener';
      }
    } else {
      els.link.hidden = true;
    }

    // 「Pin it」：把这张图送到 Pinterest。这是本页最自然的分享动作。
    var old = els.modalActions.querySelector('.pin-pinterest');
    if (old) old.remove();
    var shareUrl = 'https://www.meltpet.com/gallery#pin=' + encodeURIComponent(post.slug);
    var pinHref = 'https://www.pinterest.com/pin/create/button/?url=' + encodeURIComponent(shareUrl)
      + '&media=' + encodeURIComponent(post.imageUrl)
      + '&description=' + encodeURIComponent(post.title);
    var pin = document.createElement('a');
    pin.className = 'pin-act pin-pinterest';
    pin.href = pinHref;
    pin.target = '_blank';
    pin.rel = 'noopener noreferrer';
    pin.textContent = '📌 Pin it';
    els.modalActions.appendChild(pin);
  }

  function closeModal() {
    els.modal.hidden = true;
    document.body.classList.remove('pin-modal-open');
    modalState.slug = '';
    // 焦点还给触发它的那张卡片，键盘用户才能接着往下翻
    if (lastFocused && lastFocused.focus) {
      try { lastFocused.focus(); } catch (e) { /* 元素可能已被重渲染移除 */ }
    }
    lastFocused = null;
    try {
      if (location.hash.indexOf('#pin=') === 0) history.replaceState(null, '', location.pathname + location.search);
    } catch (e) { /* ignore */ }
  }

  function renderComments(list) {
    els.commentList.textContent = '';
    els.commentCount.textContent = fmtNum(list.length);
    if (!list.length) {
      var none = document.createElement('p');
      none.className = 'pin-comment-none';
      none.textContent = 'No comments yet. Be the first — no account needed.';
      els.commentList.appendChild(none);
      return;
    }
    list.forEach(function (c) {
      var wrap = document.createElement('div');
      wrap.className = 'pin-comment';
      var head = document.createElement('p');
      head.className = 'pin-comment-head';
      var who = document.createElement('strong');
      who.textContent = c.author;
      var when = document.createElement('span');
      when.textContent = relTime(c.createdAt);
      head.appendChild(who);
      head.appendChild(when);
      var body = document.createElement('p');
      body.className = 'pin-comment-body';
      body.textContent = c.body;      // ← 绝不 innerHTML
      wrap.appendChild(head);
      wrap.appendChild(body);
      els.commentList.appendChild(wrap);
    });
  }

  function submitComment(ev) {
    ev.preventDefault();
    var author = els.commentAuthor.value.trim();
    var body = els.commentBody.value.trim();
    var honeypot = els.commentWebsite.value;

    if (author.length < 2) { setCommentStatus('Please enter a name (at least 2 characters).', 'error'); return; }
    if (body.length < 5) { setCommentStatus('Please write a little more.', 'error'); return; }

    els.commentSubmit.disabled = true;
    els.commentSubmit.textContent = 'Posting…';
    var elapsedMs = Date.now() - Number(els.commentForm.dataset.startedAt || Date.now());

    api('/posts/' + encodeURIComponent(modalState.slug) + '/comments', {
      method: 'POST',
      body: { author: author, body: body, website: honeypot, elapsedMs: elapsedMs },
    })
      .then(function () {
        setCommentStatus('Thanks — your comment is in the queue and will appear once it is reviewed.', 'ok');
        els.commentForm.reset();
        els.commentForm.dataset.startedAt = String(Date.now());
      })
      .catch(function (err) {
        if (err && err.code === 'api_unavailable') {
          closeModal();
          degradeToReadOnly();
          return;
        }
        if (err && err.code === 'rate_limited') {
          setCommentStatus(err.message || 'Too many comments — please wait a few minutes.', 'warn');
        } else {
          setCommentStatus((err && err.message) || 'Could not post that comment.', 'error');
        }
      })
      .finally(function () {
        els.commentSubmit.disabled = false;
        els.commentSubmit.textContent = 'Post comment';
      });
  }

  function setCommentStatus(msg, kind) {
    els.commentStatus.textContent = msg;
    els.commentStatus.className = 'pin-comment-status' + (kind ? ' is-' + kind : '');
  }

  function share() {
    var post = modalState.post;
    if (!post) return;
    var url = 'https://www.meltpet.com/gallery#pin=' + encodeURIComponent(post.slug);
    if (navigator.share) {
      navigator.share({ title: post.title, text: post.description || post.title, url: url }).catch(function () { /* 用户取消 */ });
      return;
    }
    var done = function () { notice('Link copied to clipboard.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () { notice(url, 'ok'); });
    } else {
      notice(url, 'ok');
    }
  }

  // ── 启动 ──────────────────────────────────────────────────────────────────
  function init() {
    els = {
      masonry: $('pinMasonry'),
      empty: $('pinEmpty'),
      emptyHint: $('pinEmptyHint'),
      moreBtn: $('loadMoreBtn'),
      stats: $('pinStats'),
      notice: $('pinNotice'),
      filters: document.querySelector('.pin-filters'),
      themeChips: $('themeChips'),
      speciesChips: $('speciesChips'),
      tagChips: $('tagChips'),
      tagRow: $('tagRow'),
      sortSelect: $('sortSelect'),
      resetBtn: $('resetBtn'),
      modal: $('pinModal'),
      modalCard: document.querySelector('.pin-modal-card'),
      modalImage: $('pinModalImage'),
      modalTitle: $('pinModalTitle'),
      modalDesc: $('pinModalDesc'),
      modalMeta: $('pinModalMeta'),
      modalActions: document.querySelector('.pin-modal-actions'),
      link: $('pinModalLink'),
      likeBtn: $('pinLikeBtn'),
      likeCount: $('pinLikeCount'),
      saveBtn: $('pinSaveBtn'),
      saveCount: $('pinSaveCount'),
      viewCount: $('pinViewCount'),
      shareBtn: $('pinShareBtn'),
      commentList: $('pinCommentList'),
      commentCount: $('pinCommentCount'),
      commentForm: $('pinCommentForm'),
      commentAuthor: $('pinCommentAuthor'),
      commentBody: $('pinCommentBody'),
      commentWebsite: $('pinCommentWebsite'),
      commentStatus: $('pinCommentStatus'),
      commentSubmit: $('pinCommentSubmit'),
    };
    if (!els.masonry) return;

    readUrl();

    els.moreBtn.addEventListener('click', function () { loadFeed(false); });
    els.sortSelect.addEventListener('change', function () {
      state.sort = els.sortSelect.value;
      state.offset = 0;
      updateUrl();
      loadFeed(true);
    });
    els.resetBtn.addEventListener('click', function () {
      state.theme = ''; state.species = ''; state.tag = ''; state.sort = 'recent';
      els.sortSelect.value = 'recent';
      updateUrl();
      loadTaxonomy().then(function () { loadFeed(true); });
    });

    els.modal.addEventListener('click', function (ev) {
      if (ev.target.dataset && ev.target.dataset.close) closeModal();
    });
    document.addEventListener('keydown', onModalKeydown);
    els.likeBtn.addEventListener('click', function () {
      if (modalState.slug) toggle('like', modalState.slug, null, els.likeBtn, 'likes');
    });
    els.saveBtn.addEventListener('click', function () {
      if (modalState.slug) toggle('save', modalState.slug, null, els.saveBtn, 'saves');
    });
    els.shareBtn.addEventListener('click', share);
    els.commentForm.addEventListener('submit', submitComment);

    loadTaxonomy().then(function () {
      loadFeed(true);
      // 深链接：#pin=<slug> 直接打开对应弹层
      var m = /#pin=([^&]+)/.exec(location.hash);
      if (m) {
        try { openModal(decodeURIComponent(m[1])); } catch (e) { /* ignore */ }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
