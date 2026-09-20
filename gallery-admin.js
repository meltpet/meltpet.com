/* ============================================================================
 * MeltPet — Pin Gallery 管理端
 * ----------------------------------------------------------------------------
 * 只有站主用。要点：
 *  1. 会话令牌存 sessionStorage（关标签页即失效），不写 localStorage。
 *  2. 上传前在浏览器里**降采样**：原图 3–5MB，压到 1000px 宽约 150–250KB，
 *     直接决定信息流的加载速度和 R2 的存储成本。
 *  3. 上传走 multipart，其余写操作走 JSON + Authorization 头。
 *  4. 任何服务端返回的字符串都用 textContent 渲染。
 * ========================================================================== */
(function () {
  'use strict';

  var TOKEN_KEY = 'meltpet.pin.admin.token';
  var MAX_UPLOAD = 8 * 1024 * 1024;

  var state = { token: '', postStatus: 'pending', commentStatus: 'pending', file: null, dims: null };
  var $ = function (id) { return document.getElementById(id); };
  var els = {};

  function token() {
    if (state.token) return state.token;
    try { state.token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { state.token = ''; }
    return state.token;
  }
  function setToken(t) {
    state.token = t || '';
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  function api(path, options) {
    var opts = options || {};
    var init = { method: opts.method || 'GET', headers: {} };
    if (opts.auth !== false) init.headers.authorization = 'Bearer ' + token();
    if (opts.form) {
      init.body = opts.form;                       // 让浏览器自己带 multipart boundary
    } else if (opts.body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch('/api' + path, init).then(function (res) {
      var ctype = res.headers.get('content-type') || '';
      if (ctype.indexOf('application/json') === -1) {
        var e = new Error('Backend unavailable on this host.');
        e.code = 'api_unavailable';
        throw e;
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data.error && data.error.message) || 'Request failed.');
          err.code = (data.error && data.error.code) || 'error';
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function status(el, msg, kind) {
    el.textContent = msg;
    el.className = 'pg-status' + (kind ? ' is-' + kind : '');
  }

  function showConsole(on) {
    els.loginPanel.hidden = on;
    els.consolePanel.hidden = !on;
  }

  // ── 登录 ──────────────────────────────────────────────────────────────────
  function login() {
    var pw = els.password.value;
    if (!pw) { status(els.loginStatus, 'Enter the password.', 'error'); return; }
    status(els.loginStatus, 'Signing in…');
    api('/admin/login', { method: 'POST', body: { password: pw }, auth: false })
      .then(function (r) {
        setToken(r.token);
        els.password.value = '';
        status(els.loginStatus, '');
        enterConsole();
      })
      .catch(function (err) {
        if (err.code === 'api_unavailable') {
          status(els.loginStatus, 'The API is not reachable on this host. Publish from www.meltpet.com.', 'error');
        } else if (err.code === 'rate_limited') {
          status(els.loginStatus, err.message || 'Too many attempts — wait a few minutes.', 'error');
        } else if (err.code === 'unavailable') {
          status(els.loginStatus, 'Admin is not configured: set ADMIN_PASSWORD and SESSION_SECRET on the Pages project.', 'error');
        } else {
          status(els.loginStatus, err.message || 'Sign-in failed.', 'error');
        }
      });
  }

  function enterConsole() {
    showConsole(true);
    var exp = 0;
    try {
      var body = token().split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      exp = JSON.parse(atob(body)).exp || 0;
    } catch (e) { exp = 0; }
    els.sessionInfo.textContent = exp
      ? 'Session valid until ' + new Date(exp * 1000).toLocaleString() + '. Stored in this tab only.'
      : 'Session active.';
    loadPosts();
    loadComments();
  }

  function logout() {
    setToken('');
    showConsole(false);
  }

  // ── 图片选择 + 降采样 ─────────────────────────────────────────────────────

  function pickFile(file) {
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      status(els.publishStatus, 'That file is larger than 8MB. Compress it first or lower the resize target.', 'error');
      return;
    }
    state.file = file;
    state.dims = null;
    els.dropText.textContent = file.name + ' · ' + Math.round(file.size / 1024) + 'KB';
    // 预览用 blob: —— _headers 的 CSP 里 img-src 已放行 blob:
    // （没有这一条的话预览会被 CSP 静默拦掉，只剩一个空框，极难排查）
    var url = URL.createObjectURL(file);
    els.preview.src = url;
    els.preview.hidden = false;
    els.preview.onload = function () {
      state.dims = { w: els.preview.naturalWidth, h: els.preview.naturalHeight };
      els.fileHint.textContent = 'Loaded ' + state.dims.w + '×' + state.dims.h
        + ' · ' + Math.round(file.size / 1024) + 'KB'
        + (state.dims.w / state.dims.h > 1.2 ? ' — this is a landscape image; a 2:3 vertical crop shows better on the board.' : '');
    };
  }

  /**
   * 客户端降采样。canvas → toBlob。
   * WebP 优先（同画质体积更小），浏览器不支持时退回 JPEG。
   */
  function downscale(file, maxWidth) {
    if (!maxWidth) return Promise.resolve({ blob: file, w: 0, h: 0, resized: false });
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      if (w <= maxWidth) return { blob: file, w: w, h: h, resized: false };
      var scale = maxWidth / w;
      var tw = Math.round(w * scale);
      var th = Math.round(h * scale);
      var canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, tw, th);
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob) { resolve({ blob: file, w: w, h: h, resized: false }); return; }
          resolve({ blob: blob, w: tw, h: th, resized: true });
        }, 'image/webp', 0.86);
      });
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  function uploadImage() {
    if (!state.file) return Promise.reject(new Error('Choose an image first.'));
    var maxW = Number(els.resize.value) || 0;
    return downscale(state.file, maxW).then(function (out) {
      var name = state.file.name.replace(/\.[^.]+$/, '') + (out.resized ? '.webp' : '');
      var form = new FormData();
      form.append('file', out.blob, name);
      return api('/admin/uploads', { method: 'POST', form: form }).then(function (r) {
        return { key: r.key, url: r.url, w: out.w || null, h: out.h || null, resized: out.resized };
      });
    });
  }

  // ── 发布 ──────────────────────────────────────────────────────────────────
  function publish(asStatus) {
    var title = els.title.value.trim();
    if (!state.file) { status(els.publishStatus, 'Choose an image first.', 'error'); return; }
    if (title.length < 3) { status(els.publishStatus, 'Give it a title (at least 3 characters).', 'error'); return; }

    els.publishBtn.disabled = true;
    els.draftBtn.disabled = true;
    status(els.publishStatus, 'Uploading image…');

    uploadImage()
      .then(function (up) {
        status(els.publishStatus, 'Saving pin…');
        var tags = els.tags.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
        return api('/admin/posts', {
          method: 'POST',
          body: {
            title: title,
            slug: els.slug.value.trim() || undefined,
            description: els.desc.value.trim(),
            imageKey: up.key,
            imageW: up.w || state.dims && state.dims.w || undefined,
            imageH: up.h || state.dims && state.dims.h || undefined,
            imageAlt: els.alt.value.trim(),
            linkUrl: els.link.value.trim(),
            linkLabel: els.linkLabel.value.trim(),
            theme: els.theme.value,
            species: els.species.value,
            tags: tags,
            sortWeight: Number(els.weight.value) || 0,
            status: asStatus,
          },
        });
      })
      .then(function (r) {
        var verb = asStatus === 'published' ? 'Published' : 'Saved for review';
        status(els.publishStatus, verb + ': /gallery#' + (r.post && r.post.slug ? r.post.slug : ''), 'ok');
        resetForm();
        loadPosts();
      })
      .catch(function (err) {
        if (err.code === 'api_unavailable') {
          status(els.publishStatus, 'API unreachable on this host.', 'error');
        } else if (err.code === 'unauthorized') {
          status(els.publishStatus, 'Session expired — sign in again.', 'error');
          logout();
        } else if (err.code === 'rate_limited') {
          status(els.publishStatus, err.message || 'Upload rate limit reached.', 'error');
        } else {
          status(els.publishStatus, err.message || 'Publish failed.', 'error');
        }
      })
      .finally(function () {
        els.publishBtn.disabled = false;
        els.draftBtn.disabled = false;
      });
  }

  function resetForm() {
    ['title', 'slug', 'desc', 'alt', 'link', 'linkLabel', 'tags'].forEach(function (k) { els[k].value = ''; });
    els.weight.value = '0';
    els.preview.hidden = true;
    els.preview.removeAttribute('src');
    els.dropText.textContent = 'Drop an image here, or click to choose a file';
    state.file = null;
    state.dims = null;
  }

  // ── 作品队列 ──────────────────────────────────────────────────────────────
  function loadPosts() {
    els.postList.textContent = '';
    var note = document.createElement('p');
    note.className = 'pg-empty-note';
    note.textContent = 'Loading…';
    els.postList.appendChild(note);

    api('/admin/posts?status=' + encodeURIComponent(state.postStatus))
      .then(function (data) {
        renderPostTabs(data.counts);
        els.postList.textContent = '';
        if (!data.items.length) {
          var empty = document.createElement('p');
          empty.className = 'pg-empty-note';
          empty.textContent = 'Nothing here.';
          els.postList.appendChild(empty);
          return;
        }
        data.items.forEach(function (p) { els.postList.appendChild(renderPost(p)); });
      })
      .catch(handleConsoleError);
  }

  function renderPostTabs(counts) {
    Array.prototype.forEach.call(els.postTabs.querySelectorAll('button'), function (b) {
      var s = b.dataset.status;
      var n = counts ? (counts[s] || 0) : 0;
      b.textContent = b.dataset.status.charAt(0).toUpperCase() + b.dataset.status.slice(1) + ' (' + n + ')';
      b.classList.toggle('pg-btn-ok', s === state.postStatus);
    });
  }

  function renderPost(p) {
    var item = document.createElement('div');
    item.className = 'pg-queue-item';

    var img = document.createElement('img');
    img.className = 'pg-queue-thumb';
    img.src = p.imageUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 84;
    img.height = 84;
    item.appendChild(img);

    var main = document.createElement('div');
    main.className = 'pg-queue-main';

    var h = document.createElement('h3');
    h.textContent = p.title;
    main.appendChild(h);

    if (p.description) {
      var d = document.createElement('p');
      d.textContent = p.description.slice(0, 180);
      main.appendChild(d);
    }

    var meta = document.createElement('p');
    meta.className = 'pg-queue-meta';
    meta.textContent = [p.status, p.theme, p.species, p.linkUrl || 'no link', '/gallery#' + p.slug].join(' · ');
    main.appendChild(meta);

    var btns = document.createElement('div');
    btns.className = 'pg-queue-btns';

    if (p.status !== 'published') {
      btns.appendChild(mkBtn('Publish', 'pg-btn pg-btn-ok', function () { setPostStatus(p.id, 'published'); }));
    }
    if (p.status !== 'rejected') {
      btns.appendChild(mkBtn('Reject', 'pg-btn', function () { setPostStatus(p.id, 'rejected'); }));
    }
    if (p.status !== 'pending') {
      btns.appendChild(mkBtn('Back to pending', 'pg-btn', function () { setPostStatus(p.id, 'pending'); }));
    }
    btns.appendChild(mkBtn('Copy link', 'pg-btn', function () {
      var url = 'https://www.meltpet.com/gallery#pin=' + encodeURIComponent(p.slug);
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
    }));
    btns.appendChild(mkBtn('Delete', 'pg-btn pg-btn-danger', function () {
      if (!confirm('Delete "' + p.title + '" and its image from R2? This cannot be undone.')) return;
      removePost(p.id);
    }));

    main.appendChild(btns);
    item.appendChild(main);
    return item;
  }

  function mkBtn(label, cls, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function setPostStatus(id, st) {
    api('/admin/posts/' + encodeURIComponent(id) + '/status', {
      method: 'POST',
      body: { status: st, reason: st === 'rejected' ? 'Not a fit for the board.' : '' },
    })
      .then(loadPosts)
      .catch(handleConsoleError);
  }

  function removePost(id) {
    api('/admin/posts/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(loadPosts)
      .catch(handleConsoleError);
  }

  // ── 评论队列 ──────────────────────────────────────────────────────────────
  function loadComments() {
    els.commentList.textContent = '';
    var note = document.createElement('p');
    note.className = 'pg-empty-note';
    note.textContent = 'Loading…';
    els.commentList.appendChild(note);

    api('/admin/comments?status=' + encodeURIComponent(state.commentStatus))
      .then(function (data) {
        Array.prototype.forEach.call(els.commentTabs.querySelectorAll('button'), function (b) {
          var s = b.dataset.status;
          b.textContent = b.dataset.status.charAt(0).toUpperCase() + b.dataset.status.slice(1)
            + ' (' + ((data.counts && data.counts[s]) || 0) + ')';
          b.classList.toggle('pg-btn-ok', s === state.commentStatus);
        });
        els.commentList.textContent = '';
        if (!data.items.length) {
          var empty = document.createElement('p');
          empty.className = 'pg-empty-note';
          empty.textContent = 'Nothing here.';
          els.commentList.appendChild(empty);
          return;
        }
        data.items.forEach(function (c) { els.commentList.appendChild(renderComment(c)); });
      })
      .catch(handleConsoleError);
  }

  function renderComment(c) {
    var item = document.createElement('div');
    item.className = 'pg-queue-item';
    var main = document.createElement('div');
    main.className = 'pg-queue-main';

    var h = document.createElement('h3');
    h.textContent = c.author + ' — on ' + (c.postTitle || '');
    main.appendChild(h);

    var body = document.createElement('p');
    body.textContent = c.body;              // ← textContent，绝不 innerHTML
    main.appendChild(body);

    var meta = document.createElement('p');
    meta.className = 'pg-queue-meta';
    meta.textContent = [c.status, new Date(c.createdAt).toLocaleString(), '/gallery#pin=' + c.postSlug].join(' · ');
    main.appendChild(meta);

    var btns = document.createElement('div');
    btns.className = 'pg-queue-btns';
    if (c.status !== 'approved') {
      btns.appendChild(mkBtn('Approve', 'pg-btn pg-btn-ok', function () { setCommentStatus(c.id, 'approved'); }));
    }
    if (c.status !== 'rejected') {
      btns.appendChild(mkBtn('Reject', 'pg-btn', function () { setCommentStatus(c.id, 'rejected'); }));
    }
    if (c.status !== 'pending') {
      btns.appendChild(mkBtn('Back to pending', 'pg-btn', function () { setCommentStatus(c.id, 'pending'); }));
    }
    btns.appendChild(mkBtn('Delete', 'pg-btn pg-btn-danger', function () {
      if (!confirm('Delete this comment permanently?')) return;
      api('/admin/comments/' + encodeURIComponent(c.id), { method: 'DELETE' })
        .then(loadComments)
        .catch(handleConsoleError);
    }));
    main.appendChild(btns);
    item.appendChild(main);
    return item;
  }

  function setCommentStatus(id, st) {
    api('/admin/comments/' + encodeURIComponent(id) + '/status', { method: 'POST', body: { status: st } })
      .then(loadComments)
      .catch(handleConsoleError);
  }

  function handleConsoleError(err) {
    if (err && err.code === 'unauthorized') {
      logout();
      status(els.loginStatus, 'Session expired — sign in again.', 'error');
      return;
    }
    if (err && err.code === 'api_unavailable') {
      status(els.loginStatus, 'The API is not reachable on this host.', 'error');
      return;
    }
    console.error(err);
  }

  // ── 启动 ──────────────────────────────────────────────────────────────────
  function init() {
    els = {
      loginPanel: $('loginPanel'),
      consolePanel: $('consolePanel'),
      password: $('pgPassword'),
      loginBtn: $('pgLoginBtn'),
      loginStatus: $('pgLoginStatus'),
      logoutBtn: $('pgLogoutBtn'),
      sessionInfo: $('pgSessionInfo'),
      drop: $('pgDrop'),
      dropText: $('pgDropText'),
      file: $('pgFile'),
      fileHint: $('pgFileHint'),
      preview: $('pgPreview'),
      resize: $('pgResize'),
      title: $('pgTitle'),
      slug: $('pgSlug'),
      desc: $('pgDesc'),
      alt: $('pgAlt'),
      link: $('pgLink'),
      linkLabel: $('pgLinkLabel'),
      theme: $('pgTheme'),
      species: $('pgSpecies'),
      weight: $('pgWeight'),
      tags: $('pgTags'),
      publishBtn: $('pgPublishBtn'),
      draftBtn: $('pgDraftBtn'),
      publishStatus: $('pgPublishStatus'),
      postTabs: $('pgPostTabs'),
      postList: $('pgPostList'),
      commentTabs: $('pgCommentTabs'),
      commentList: $('pgCommentList'),
      pruneBtn: $('pgPruneBtn'),
      pruneStatus: $('pgPruneStatus'),
    };
    if (!els.loginPanel) return;

    els.loginBtn.addEventListener('click', login);
    els.password.addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
    els.logoutBtn.addEventListener('click', logout);

    els.drop.addEventListener('click', function () { els.file.click(); });
    els.drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.file.click(); }
    });
    els.file.addEventListener('change', function () { pickFile(els.file.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.remove('is-over'); });
    });
    els.drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
    });

    els.publishBtn.addEventListener('click', function () { publish('published'); });
    els.draftBtn.addEventListener('click', function () { publish('pending'); });

    els.postTabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-status]');
      if (!b) return;
      state.postStatus = b.dataset.status;
      loadPosts();
    });
    els.commentTabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-status]');
      if (!b) return;
      state.commentStatus = b.dataset.status;
      loadComments();
    });

    els.pruneBtn.addEventListener('click', function () {
      status(els.pruneStatus, 'Pruning…');
      api('/admin/maintenance/prune-rate', { method: 'POST' })
        .then(function (r) { status(els.pruneStatus, 'Removed ' + r.removed + ' expired rows.', 'ok'); })
        .catch(function (err) { status(els.pruneStatus, err.message || 'Prune failed.', 'error'); });
    });

    if (token()) enterConsole(); else showConsole(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
