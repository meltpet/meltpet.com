// MeltPet Tool Share Engine v1 (2026-08-07)
// 自动为所有工具页的 #result 容器注入 "Copy Result" + "Share" 按钮。
// 统一接入：在任意工具页引入本脚本即可，无需修改各工具自身 JS。
(function() {
    'use strict';

    // ── 工具页识别 ──
    // 仅在与列表匹配的工具页面启用（防误注入）
    var TOOL_PATHS = [
        '/breed-finder', '/dog-breed-finder', '/cat-breed-finder',
        '/monthly-pet-cost', '/adopt-vs-buy', '/pet-age-calculator',
        '/pet-name-generator', '/toxic-food-checker', '/dog-food-cost-calculator',
        '/dog-weight-calculator', '/cat-calorie-calculator', '/pet-compatibility-quiz'
    ];
    var isToolPage = TOOL_PATHS.some(function(p) {
        return window.location.pathname === p || window.location.pathname.indexOf(p) === 0;
    });
    if (!isToolPage) return;

    var RESULT_ID = 'result';
    var TOOL_TITLE = (document.title || 'MeltPet tool').replace(/[|–—-].*$/, '').trim() || 'MeltPet tool';
    var BRAND_URL = 'https://www.meltpet.com' + window.location.pathname;

    // ── 按钮样式（与站点设计语言一致） ──
    var BTN_STYLE = [
        'display:inline-flex;align-items:center;gap:6px;',
        'padding:8px 16px;border-radius:8px;border:1px solid var(--border-light,#E5E1D8);',
        'background:var(--bg-surface,#FFFFFF);color:var(--text-heading,#1F1F1F);',
        'font-size:0.85rem;font-weight:600;cursor:pointer;line-height:1;',
        'transition:background 0.15s ease;font-family:inherit;'
    ].join('');
    var BTN_HOVER = 'background:var(--accent-soft,#FDE8D2);border-color:var(--brand-accent,#F6851B);';
    var BAR_STYLE = [
        'display:flex;flex-wrap:wrap;gap:10px;justify-content:center;',
        'margin-top:16px;padding-top:14px;border-top:1px dashed var(--border-light,#E5E1D8);'
    ].join('');

    // ── 从结果容器提取纯文本 ──
    function extractResultText(container) {
        if (!container) return '';
        // 克隆以移除按钮区，避免复制到自身
        var clone = container.cloneNode(true);
        var injected = clone.querySelector('.meltpet-share-bar');
        if (injected) injected.remove();
        // 隐藏元素不计入（如 aria-hidden）
        clone.querySelectorAll('[aria-hidden="true"], [style*="display:none"]').forEach(function(el) { el.remove(); });
        var text = (clone.innerText || clone.textContent || '')
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.%])/g, '$1')
            .trim();
        return text;
    }

    // ── 复制到剪贴板（降级方案） ──
    function copyText(text, done) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function() { done(true); }, function() { fallback(); });
        } else { fallback(); }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { done(document.execCommand('copy')); } catch (e) { done(false); }
            document.body.removeChild(ta);
        }
    }

    function flash(btn, okText) {
        var orig = btn.textContent;
        btn.textContent = okText;
        btn.style.borderColor = '#16A34A';
        btn.style.color = '#16A34A';
        setTimeout(function() {
            btn.textContent = orig;
            btn.style.borderColor = '';
            btn.style.color = '';
        }, 1800);
    }

    // ── 分享文案构建 ──
    function buildShareText(resultText) {
        var firstLine = resultText.split('\n')[0].split('.')[0].slice(0, 140);
        return TOOL_TITLE + ': ' + firstLine + ' — via MeltPet ' + BRAND_URL;
    }

    // ── 注入按钮栏 ──
    function injectBar(resultDiv) {
        if (!resultDiv || resultDiv.querySelector('.meltpet-share-bar')) return;

        var bar = document.createElement('div');
        bar.className = 'meltpet-share-bar';
        bar.style.cssText = BAR_STYLE;

        var btnCopy = document.createElement('button');
        btnCopy.type = 'button';
        btnCopy.style.cssText = BTN_STYLE;
        btnCopy.innerHTML = '📋 Copy Result';
        btnCopy.setAttribute('aria-label', 'Copy tool result to clipboard');
        btnCopy.addEventListener('click', function() {
            var text = extractResultText(resultDiv);
            if (!text) return;
            copyText(text, function(ok) { flash(btnCopy, ok ? '✅ Copied!' : 'Copy failed'); });
        });
        btnCopy.addEventListener('mouseenter', function() { btnCopy.style.cssText = BTN_STYLE + BTN_HOVER; });
        btnCopy.addEventListener('mouseleave', function() { btnCopy.style.cssText = BTN_STYLE; });

        var btnShare = document.createElement('button');
        btnShare.type = 'button';
        btnShare.style.cssText = BTN_STYLE;
        btnShare.innerHTML = '🔗 Share Result';
        btnShare.setAttribute('aria-label', 'Share tool result');
        btnShare.addEventListener('click', function() {
            var text = extractResultText(resultDiv);
            var shareText = buildShareText(text);
            // 移动端优先原生分享
            if (navigator.share) {
                navigator.share({
                    title: TOOL_TITLE,
                    text: shareText,
                    url: BRAND_URL
                }).catch(function() {});
            } else {
                copyText(shareText + '\n\n' + BRAND_URL, function(ok) {
                    flash(btnShare, ok ? '✅ Share link copied!' : 'Copy failed');
                });
            }
        });
        btnShare.addEventListener('mouseenter', function() { btnShare.style.cssText = BTN_STYLE + BTN_HOVER; });
        btnShare.addEventListener('mouseleave', function() { btnShare.style.cssText = BTN_STYLE; });

        bar.appendChild(btnCopy);
        bar.appendChild(btnShare);
        resultDiv.appendChild(bar);
    }

    // ── MutationObserver：监听结果容器出现/变化 ──
    function observe() {
        var resultDiv = document.getElementById(RESULT_ID);
        if (resultDiv) {
            // 结果已显示则立即注入
            if (resultDiv.style.display !== 'none' && resultDiv.innerHTML.trim().length > 0) {
                injectBar(resultDiv);
            }
        }

        // 监听 body 变化：结果容器从 display:none -> block 时注入
        var body = document.body;
        if (!body) { document.addEventListener('DOMContentLoaded', observe); return; }

        var observer = new MutationObserver(function(mutations) {
            var result = document.getElementById(RESULT_ID);
            if (!result) return;
            var visible = result.style.display !== 'none' && result.innerHTML.trim().length > 20;
            if (visible) {
                injectBar(result);
            } else {
                // 结果重置时移除旧按钮栏
                var bar = result.querySelector('.meltpet-share-bar');
                if (bar) bar.remove();
            }
        });
        observer.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observe);
    } else {
        observe();
    }
})();
