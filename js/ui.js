import {fetchJSON, escapeHTML as esc} from './data.js?v=25';

let toastTimer;
const copyTimers = new WeakMap();
let historyOpener;
export function initTheme() {
    const mode = localStorage.getItem('gcable_theme_mode') || 'auto';
    setThemeMode(mode, false);
    
    // 监听系统深浅色偏好变动
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if ((localStorage.getItem('gcable_theme_mode') || 'auto') === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
}

export function setThemeMode(mode, save = true) {
    if (save) localStorage.setItem('gcable_theme_mode', mode);
    let effective = mode;
    if (mode === 'auto') {
        effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);

    const btnLight = document.getElementById('theme-btn-light');
    const btnDark = document.getElementById('theme-btn-dark');
    const btnAuto = document.getElementById('theme-btn-auto');

    for (const [button, value] of [[btnLight, 'light'], [btnDark, 'dark'], [btnAuto, 'auto']]) {
        if (!button) continue;
        button.classList.toggle('active', mode === value);
        button.setAttribute('aria-pressed', String(mode === value));
    }
}

// -------------------------------------------------------------
// 2. 返回顶部与剪贴板反馈
// -------------------------------------------------------------
window.addEventListener('scroll', () => {
    const btn = document.getElementById('btn-back-to-top');
    if (btn) {
        if (window.scrollY > 260) {
            btn.style.display = 'inline-flex';
        } else {
            btn.style.display = 'none';
        }
    }
}, { passive: true });

export function scrollToTop() {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

export function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 1800);
}

function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    const previous = document.activeElement;
    ta.focus();
    ta.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } finally { ta.remove(); previous?.focus({preventScroll:true}); }
    return copied ? Promise.resolve() : Promise.reject(new Error('Clipboard unavailable'));
}

export function copyBtnFeedback(btn, text, successMsg) {
    copyTextToClipboard(text).then(() => {
        showToast(successMsg || '已复制：' + text);
        if (btn) {
            const pending = copyTimers.get(btn);
            const orig = pending?.original || btn.innerHTML;
            clearTimeout(pending?.timer);
            btn.innerText = '✓ 已复制';
            btn.classList.add('copied');
            const timer = setTimeout(() => {
                btn.innerHTML = orig;
                btn.classList.remove('copied');
                copyTimers.delete(btn);
            }, 1500);
            copyTimers.set(btn, {original:orig,timer});
        }
    }).catch(() => showToast('复制失败，请允许剪贴板访问后重试'));
}


export function openHistoryModal() {
    const modal = document.getElementById('history-modal');
    const body = document.getElementById('history-modal-body');
    if (!modal || !body) return;
    historyOpener = document.activeElement;
    document.body.style.overflow = 'hidden';
    modal.classList.add('active');
    body.scrollTop = 0;
    body.focus({preventScroll:true});
    
    fetchJSON('./channel_history.json').then(data => {
        const meta = data.meta || {};
        const events = data.events || [];
        const dead = data.dead_channels || {};
        
        let html = `
            <div class="info-panel" style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div><b>最近监测：</b> ${esc(meta.last_updated || '-')}</div>
                    <div style="display:flex; gap:8px;">
                        <span style="color:var(--accent); font-weight:700;">🟢 HLS 清单已取得: ${meta.playable_count || 0}</span>
                        <span style="color:var(--danger); font-weight:700;">🔴 HLS 清单未取得: ${meta.dead_count || 0}</span>
                    </div>
                </div>
            </div>
            
            <div style="font-size:13px; font-weight:700; margin-bottom:8px;">🔴 本次未取得谷豆 HLS 清单的频道 (${Object.keys(dead).length})</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; padding:4px;">
        `;
        
        for (const [cid, info] of Object.entries(dead)) {
            html += `<span class="pill-cat" style="background:var(--strip-bg); color:var(--danger); border:1px solid var(--border-light); font-size:11px; padding:3px 8px; border-radius:4px;">#${esc(cid)} ${esc(info.name)}</span>`;
        }
        
        html += `
            </div>
            <div style="font-size:13px; font-weight:700; margin-bottom:8px;">🕒 变更与状态变动时间线 (最新 ${events.length} 条)</div>
            <div class="epg-timeline-list">
        `;
        
        const typeMap = {
            'channel_added': '<span style="color:var(--accent); font-weight:700;">[新增]</span>',
            'channel_removed': '<span style="color:var(--text-muted); font-weight:700;">[下架]</span>',
            'stream_dead': '<span style="color:var(--danger); font-weight:700;">[清单未取得]</span>',
            'stream_recovered': '<span style="color:var(--rtp-color); font-weight:700;">[清单恢复]</span>'
        };
        
        events.slice().reverse().forEach(ev => {
            const tag = typeMap[ev.type] || '[变动]';
            html += `
                <div class="epg-entry">
                    <div>
                        <div style="font-size:11px; color:var(--text-muted); font-variant-numeric:tabular-nums;">${esc(ev.timestamp)} · 频道ID: ${esc(ev.channelID)}</div>
                        <div style="font-size:13px; font-weight:600; margin-top:2px;">${tag} <b>${esc(ev.name)}</b> - <span style="font-size:12px; color:var(--text-muted); font-weight:normal;">${esc(ev.detail)}</span></div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        body.innerHTML = html;
    }).catch(() => {
        body.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:30px;">暂未找到历史变更记录</div>';
    });
}

export function closeHistoryModal(e) {
    if (!e?.target || e.target.id === 'history-modal') {
        const modal = document.getElementById('history-modal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
        if (historyOpener?.isConnected) historyOpener.focus({preventScroll:true});
    }
}

window.addEventListener('pointerdown', () => {
    document.documentElement.toggleAttribute('data-pointer-input', true);
}, {capture:true, passive:true});
window.addEventListener('keydown', event => {
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        document.documentElement.removeAttribute('data-pointer-input');
    }
}, {capture:true});

window.addEventListener('keydown', event => {
    const modal = document.getElementById('history-modal');
    if (!modal?.classList.contains('active')) return;
    if (event.key === 'Escape') closeHistoryModal();
    if (event.key === 'Tab') {
        const targets = Array.from(modal.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'))
            .filter(element => element.getClientRects().length && !element.disabled);
        const first = targets[0], last = targets.at(-1);
        if (!first) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({preventScroll:true}); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({preventScroll:true}); }
        else if (!modal.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus({preventScroll:true}); }
    }
});
