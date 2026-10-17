import {state, regionalChannel, channelRegions, regionCode, loadRegion, loadSchedule, escapeHTML as esc, chinaTime, chinaDate, streamURL, replayTemplate} from './data.js?v=25';
import {getChannelIconHTML} from './icons.js?v=25';
import {copyBtnFeedback, showToast} from './ui.js?v=25';
import {openPicker, closePicker} from './picker.js?v=25';

let channel = null;
let programmes = [];
let activeDate = '';
let requestVersion = 0;
let renderVersion = 0;
let observer;
let opener;
let pendingHistoryClose = false;
let queuedOpen;

function deliveryValues(value) {
    if (!value?.startsWith('delivery://')) return null;
    const parts = value.slice(11).split('.');
    if (parts.length < 6) return null;
    return [Number(parts[0]) >= 10000 ? `${Number(parts[0]) / 1000} MHz` : `${parts[0]} MHz`, `${parts[1]} KSym/s`, `QAM-${parts[2]}`, ...parts.slice(3,6).map(part => part === 'null' ? '未指定' : part)];
}
function fillChannel() {
    document.getElementById('d-emblem').innerHTML = getChannelIconHTML(channel);
    document.getElementById('d-title').textContent = channel.name;
    document.getElementById('d-num').textContent = `#${channel.channelNumber} · 频道ID: ${channel.channelID}`;
    document.getElementById('d-cat').textContent = channel.category;
    document.getElementById('d-cat-detail').textContent = channel.category;
    document.getElementById('d-source-groups').textContent = channel.sourceGroups?.join('、') || '未提供';
    document.getElementById('d-start-over').textContent = channel.isStartOver === '1' ? '支持从头播放' : '未开通从头播放';
    document.getElementById('d-source-metadata').textContent = JSON.stringify(channel.sourceMetadata || channel, null, 2);
    document.getElementById('d-rtp').textContent = channel.rtp;
    const url = streamURL(channel);
    document.getElementById('d-gudou').textContent = url;
    document.getElementById('d-gudou').title = url;
    document.getElementById('d-gudou-status').textContent = channel.playable === true ? '本次检测已取得 HLS 播放列表' : channel.playable === false ? '本次检测未取得 HLS 播放列表；以下为按频道规则生成的地址' : '单播地址尚未验证';
    document.getElementById('d-catchup-tpl').textContent = replayTemplate(channel);
    document.getElementById('d-catchup-tpl').title = replayTemplate(channel);
    document.getElementById('row-catchup').hidden = channel.isTVAnyTime !== '1';
    document.getElementById('d-replay').textContent = channel.isTVAnyTime === '1' ? '支持 7 天时移回看' : '未开通时移回看';
    document.getElementById('d-replay').style.color = channel.isTVAnyTime === '1' ? 'var(--accent)' : 'var(--text-muted)';
    const values = deliveryValues(channel.delivery);
    const grid = document.getElementById('d-dvb-grid');
    grid.replaceChildren();
    if (values) {
        ['中心载波频率', '符号率 (SR)', '调制方式', '业务标识 (SID)', '视频 PID', '音频 PID'].forEach((label, index) => {
            const chip = document.createElement('div'); chip.className = 'dvb-chip';
            chip.innerHTML = `<span class="dvb-chip-label">${label}</span><span class="dvb-chip-val">${esc(values[index])}</span>`;
            grid.append(chip);
        });
    } else {
        const message = document.createElement('div'); message.style.gridColumn = '1/-1';
        message.textContent = '该地区未下发 DVB-C 频点参数'; grid.append(message);
    }
    document.getElementById('d-delivery').textContent = channel.delivery || '未提供';
    document.getElementById('d-delivery').title = channel.delivery || '';
    document.getElementById('hero-live-badge').title = '频道直播业务标识；不代表浏览器已检测到直播画面';
}

export function openDrawer(selected, {restore = false, region: restoredRegion} = {}) {
    // Wait for our asynchronous Back before creating another drawer entry.
    if (pendingHistoryClose && !restore) {
        queuedOpen = {selected, trigger: document.activeElement};
        return;
    }
    const cid = String(selected.channelID);
    const codes = channelRegions(cid);
    if (!codes.length || (restore && !codes.includes(restoredRegion))) return;
    closePicker(false);
    const overlay = document.getElementById('drawer-overlay');
    if (!overlay.classList.contains('active')) opener = document.activeElement;
    document.getElementById('d-title').textContent = selected.name;
    document.getElementById('d-emblem').innerHTML = getChannelIconHTML(selected);
    const trigger = document.getElementById('d-region');
    const preferred = restore ? restoredRegion : String(regionCode() || selected.sourceRegion || selected.regionCode || codes[0]);
    trigger.value = codes.includes(preferred) ? preferred : codes[0];
    document.getElementById('d-region-text').textContent = `${state.index.regions[trigger.value].name} (${trigger.value})`;
    trigger.onclick = () => openPicker({
        trigger, title: '选择详情地区来源',
        description: '仅列出该频道实际存在的地区来源；切换后读取对应地区的频道参数和节目单，不使用其他地区数据替代。',
        selected: trigger.value,
        options: codes.map(value => ({value, label: `${state.index.regions[value].name} (${value})`})),
        onSelect: code => {
            trigger.value = code;
            document.getElementById('d-region-text').textContent = `${state.index.regions[code].name} (${code})`;
            history.replaceState({...history.state, drawerOpen:true, channelID:cid, regionCode:code}, '');
            return updateRegion(cid, code);
        }
    });
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (!restore) history.pushState({...history.state, drawerOpen:true, channelID:cid, regionCode:trigger.value}, '');
    updateRegion(cid, trigger.value);
    document.querySelector('#main-drawer .drawer-body').scrollTop = 0;
    document.getElementById('drawer-close').focus({preventScroll:true});
}
async function updateRegion(cid, code) {
    const version = ++requestVersion;
    observer?.disconnect(); ++renderVersion;
    channel = null;
    for (const id of ['d-cat','d-cat-detail','d-source-groups','d-start-over','d-source-metadata','d-rtp','d-gudou','d-gudou-status','d-catchup-tpl','d-replay','d-delivery']) {
        document.getElementById(id).textContent = '正在载入…';
    }
    document.getElementById('d-dvb-grid').replaceChildren();
    document.getElementById('d-num').textContent = `频道ID: ${cid} · 正在载入地区信息`;
    document.querySelectorAll('#main-drawer .stream-entry button').forEach(button => { button.disabled = true; });
    programmes = [];
    const list = document.getElementById('d-epg-list');
    document.getElementById('date-tabs').replaceChildren();
    document.getElementById('d-epg-count').textContent = '正在载入…';
    list.textContent = '正在读取该地区节目单…';
    try {
        await loadRegion(code);
        if (version !== requestVersion) return false;
        channel = regionalChannel(cid, code);
        if (!channel) throw new Error('Channel missing from region catalog');
        fillChannel();
        document.querySelectorAll('#main-drawer .stream-entry button').forEach(button => { button.disabled = false; });
        const result = await loadSchedule(cid, code);
        if (version !== requestVersion) return false;
        if (result === null) {
            document.getElementById('d-epg-count').textContent = '未取得数据';
            list.textContent = '本次未取得该地区节目单，未使用其他地区数据替代。';
            return true;
        }
        programmes = result;
        document.getElementById('d-epg-count').textContent = `${programmes.length} 条节目`;
        buildDateTabs(); renderProgrammes();
        return true;
    } catch {
        if (version !== requestVersion) return false;
        document.getElementById('d-epg-count').textContent = '载入失败';
        list.textContent = '该地区节目单载入失败，请重新选择地区重试。';
        return false;
    }
}
function buildDateTabs() {
    const dates = [...new Set(programmes.map(programme => programme.start.slice(0,10)))].sort().reverse();
    const today = chinaDate();
    activeDate = dates.includes(today) ? today : dates[0] || 'ALL';
    const tabs = document.getElementById('date-tabs'); tabs.replaceChildren();
    for (const date of [...dates, 'ALL']) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'date-pill';
        button.dataset.date = date;
        button.textContent = date === 'ALL' ? '全部日期' : `${date === today ? '今天 ' : ''}${date.slice(5).replace('-','月')}日`;
        button.onclick = () => { if (activeDate === date) return; activeDate = date; renderProgrammes(); };
        tabs.append(button);
    }
}
function replayAllowed(programme) {
    const start = chinaTime(programme.start), end = chinaTime(programme.end), now = Date.now();
    return channel?.isTVAnyTime === '1' && programme.canReplay !== false && end <= now && start >= now - 7 * 86400000 && end > start;
}
function programmeCard(programme, now) {
    const start = chinaTime(programme.start), end = chinaTime(programme.end);
    const current = start <= now && now < end;
    const card = document.createElement('div'); card.className = 'epg-entry' + (current ? ' now' : '');
    const body = document.createElement('div'); body.style.cssText = 'flex:1;min-width:0;';
    const time = document.createElement('div'); time.className = 'epg-time';
    time.textContent = `${programme.start.slice(11,16)} ~ ${programme.end.slice(11,16)} (${programme.start.slice(5,10)})`;
    const title = document.createElement('div'); title.className = 'epg-title';
    const placeholder = programme.placeholder || /^(?:\d{1,2}:\d{2}(?::\d{2})?|无节目名|暂无节目|无节目信息)$/.test(programme.title.trim());
    title.textContent = placeholder ? '未提供节目名称（源站占位）' : programme.title;
    body.append(time,title); card.append(body);
    if (replayAllowed(programme)) {
        const button = document.createElement('button'); button.className = 'btn-copy-catchup'; button.textContent = '复制回看';
        button.onclick = () => {
            if (!replayAllowed(programme)) { showToast('该节目已超出回看范围'); return; }
            const offset = Math.floor((Date.now() - start) / 1000);
            const url = new URL(streamURL(channel));
            url.searchParams.set('volume', 'Suma');
            url.searchParams.set('offset', String(offset));
            copyBtnFeedback(button, url.href, '已复制回看地址');
        };
        card.append(button);
    } else {
        const badge = document.createElement('span'); badge.style.cssText = 'font-size:11px;color:var(--text-muted);white-space:nowrap;';
        badge.textContent = current ? '正在播出' : start > now ? '即将播出' : channel.isTVAnyTime !== '1' ? '未开通回看' : '已超出回看范围';
        card.append(badge);
    }
    return card;
}
function renderProgrammes() {
    observer?.disconnect();
    const version = ++renderVersion;
    document.querySelectorAll('#date-tabs .date-pill').forEach(button => {
        const selected = button.dataset.date === activeDate;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
        if (selected) {
            const tabs = button.parentElement;
            const strip = tabs.getBoundingClientRect(), chosen = button.getBoundingClientRect();
            const left = strip.left + tabs.clientLeft, right = left + tabs.clientWidth;
            if (chosen.left < left) tabs.scrollLeft += chosen.left - left;
            else if (chosen.right > right) tabs.scrollLeft += chosen.right - right;
        }
    });
    const list = document.getElementById('d-epg-list'); list.replaceChildren();
    const selected = activeDate === 'ALL' ? programmes : programmes.filter(programme => programme.start.startsWith(activeDate));
    document.getElementById('d-epg-count').textContent = `共 ${programmes.length} 条 · ${activeDate === 'ALL' ? '全部日期' : activeDate} ${selected.length} 条`;
    if (!selected.length) { list.textContent = '该日期下暂无节目单记录'; return; }
    let offset = 0;
    const sentinel = document.createElement('div'); sentinel.textContent = '继续滚动查看更多节目'; list.append(sentinel);
    function appendPage() {
        if (version !== renderVersion) return;
        const fragment = document.createDocumentFragment();
        const end = Math.min(offset + 60, selected.length), now = Date.now();
        while (offset < end) fragment.append(programmeCard(selected[offset++], now));
        list.insertBefore(fragment, sentinel);
        if (offset === selected.length) { sentinel.remove(); observer?.disconnect(); }
    }
    appendPage();
    if (offset < selected.length) {
        observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) appendPage(); }, {root:document.querySelector('#main-drawer .drawer-body'),rootMargin:'200px'});
        observer.observe(sentinel);
    }
}
export function hideDrawer(back = true) {
    const overlay = document.getElementById('drawer-overlay');
    if (!overlay.classList.contains('active')) return;
    closePicker(false);
    ++requestVersion; ++renderVersion; observer?.disconnect();
    channel = null;
    overlay.classList.remove('active'); document.body.style.overflow = '';
    if (back && history.state?.drawerOpen) {
        pendingHistoryClose = true;
        history.back();
    }
    if (opener?.isConnected) opener.focus({preventScroll:true});
}
export function closeDrawer(event) { if (event.target.id === 'drawer-overlay') hideDrawer(); }
export function copyCurrentRtp(button) { if (channel) copyBtnFeedback(button, channel.rtp, '已复制组播地址'); }
export function copyCurrentGudou(button) { if (channel) copyBtnFeedback(button, streamURL(channel), '已复制谷豆单播地址'); }
export function copyNativeCatchupTemplate(button) { if (channel?.isTVAnyTime === '1') copyBtnFeedback(button, replayTemplate(channel), '已复制时移模板'); }
window.addEventListener('popstate', () => {
    pendingHistoryClose = false;
    if (queuedOpen) {
        const {selected, trigger} = queuedOpen;
        queuedOpen = undefined;
        openDrawer(selected);
        opener = trigger;
        return;
    }
    // Read the current entry, not a potentially superseded traversal event.
    const entry = history.state;
    const selected = entry?.drawerOpen && state.byId.get(entry.channelID);
    if (selected && typeof entry.regionCode === 'string' && channelRegions(entry.channelID).includes(entry.regionCode)) {
        openDrawer(selected, {restore:true, region:entry.regionCode});
    } else {
        hideDrawer(false);
    }
});
document.getElementById('main-drawer').addEventListener('click', event => {
    const button = event.target.closest('#main-drawer .drawer-section-nav button[data-drawer-target]');
    if (!button) return;
    const body = document.querySelector('#main-drawer .drawer-body');
    const target = document.getElementById(button.dataset.drawerTarget);
    if (!target || !body.contains(target)) return;
    target.focus({preventScroll:true});
    body.scrollTo({
        top: body.scrollTop + target.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientTop,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
});
window.addEventListener('keydown', event => {
    const overlay = document.getElementById('drawer-overlay');
    if (!overlay?.classList.contains('active')) return;
    if (document.getElementById('filter-picker').open) return;
    if (event.key === 'Escape') hideDrawer();
    if (event.key === 'Tab') {
        const targets = Array.from(document.getElementById('main-drawer').querySelectorAll('button,select,a[href],summary')).filter(element => element.getClientRects().length && !element.disabled);
        const first = targets[0], last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
});
