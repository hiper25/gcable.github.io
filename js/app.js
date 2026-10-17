import {state, loadCatalog, fetchJSON, exportsForSelection} from './data.js?v=25';
import {initChannels, applyFilters, scheduleFilter, setCategory, setCity, switchView} from './channels.js?v=25';
import * as drawer from './drawer.js?v=25';
import {initTheme, setThemeMode, scrollToTop, showToast, copyBtnFeedback, openHistoryModal, closeHistoryModal} from './ui.js?v=25';

function copyExport(button, field, label) {
    if (!state.index) { showToast('频道数据尚未载入'); return; }
    const path = exportsForSelection()[field];
    if (!path) { showToast('本次未生成该地区订阅'); return; }
    copyBtnFeedback(button, new URL(path, document.baseURI).href, `已复制${state.city} ${label}`);
}
function copyM3U(button) { copyExport(button, 'playlistUrl', '组播订阅'); }
function copyGudouM3U(button) { copyExport(button, 'gudouPlaylistUrl', '谷豆订阅'); }
function copyEPG(button) { copyExport(button, 'epgUrl', 'XMLTV 节目单'); }
function exportTxt(button) {
    copyBtnFeedback(button, state.filtered.map(channel => `${channel.name},${channel.rtp}`).join('\n'), `已复制当前筛选的 ${state.filtered.length} 条组播地址`);
}
// Existing static buttons retain their handlers; dynamic content uses delegated listeners.
Object.assign(window, {setThemeMode,scrollToTop,setCategory,setCity,switchView,applyFilters:scheduleFilter,copyM3U,copyGudouM3U,copyEPG,exportTxt,openHistoryModal,closeHistoryModal,...drawer});
initTheme();
const compactLayout = window.matchMedia('(max-width: 700px)');
const overview = document.getElementById('site-overview');
overview.open = !compactLayout.matches;
document.getElementById('advanced-filters').open = window.matchMedia('(min-width: 1201px)').matches;
compactLayout.addEventListener('change', () => { overview.open = !compactLayout.matches; });
document.querySelectorAll('#cat-pills [data-cat]').forEach(button => {
    button.setAttribute('role','button'); button.tabIndex = 0;
    button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); } });
});
for (const id of ['cat-pills','city-pills']) {
    const element = document.getElementById(id);
    element.addEventListener('wheel', event => {
        if (event.deltaY && !event.deltaX && element.scrollWidth > element.clientWidth) {
            const before = element.scrollLeft;
            element.scrollLeft += event.deltaY;
            if (element.scrollLeft !== before) event.preventDefault();
        }
    }, {passive:false});
}

function renderNotices(notices) {
    const container = document.getElementById('notice-container'); container.replaceChildren();
    const groups = new Map();
    for (const [code, notice] of Object.entries(notices)) {
        const message = notice.msg?.trim();
        if (!message) continue;
        if (!groups.has(message)) groups.set(message, new Set());
        groups.get(message).add(notice.city || `区域 ${code}`);
    }
    const grouped = [...groups].sort((a, b) => b[1].size - a[1].size);
    for (const [index, [message, regions]] of grouped.entries()) {
        const cities = [...regions];
        const card = document.createElement('div'); card.className = index ? 'notice-card diff' : 'notice-card';
        const tag = document.createElement('span'); tag.className = index ? 'notice-tag diff' : 'notice-tag';
        tag.textContent = cities.length === 1 ? `${cities[0]}通告` : `${cities.length}地共同通告`;
        const wrap = document.createElement('div'); wrap.className = 'ticker-wrap'; wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', `${tag.textContent}，聚焦暂停滚动`);
        const content = document.createElement('div'); content.className = 'ticker-move';
        const text = document.createElement('span'); text.className = 'ticker-message'; text.textContent = message;
        const duplicate = text.cloneNode(true); duplicate.setAttribute('aria-hidden', 'true');
        content.append(text, duplicate); wrap.append(content); card.append(tag, wrap);
        if (cities.length > 1) {
            const details = document.createElement('details'); details.className = 'notice-regions';
            const summary = document.createElement('summary'); summary.textContent = '查看适用地区';
            const list = document.createElement('div'); list.textContent = cities.join('、');
            details.append(summary, list); card.append(details);
        }
        container.append(card);
    }
}
loadCatalog().then(() => initChannels(drawer.openDrawer, copyBtnFeedback)).catch(error => {
    document.getElementById('channels-grid').textContent = '频道数据载入失败，请刷新重试。';
    console.error(error);
});
fetchJSON('./weather.json').then(data => {
    const track = document.getElementById('weather-track'); track.replaceChildren();
    const cycle = document.createElement('div'); cycle.className = 'weather-cycle';
    for (const [city, weather] of Object.entries(data)) {
        const chip = document.createElement('div'); chip.className = 'weather-chip';
        const name = document.createElement('b'); name.textContent = city;
        const summary = document.createElement('span'); summary.textContent = weather.weather;
        const temperature = document.createElement('span'); temperature.className = 'temp'; temperature.textContent = weather.temperature;
        chip.append(name,summary,temperature);
        const wind = document.createElement('span'); wind.textContent = weather.wind || '';
        chip.append(wind); chip.title = [weather.locationName,weather.locationCode,weather.date,weather.wind].filter(Boolean).join(' · ');
        cycle.append(chip);
    }
    const duplicate = cycle.cloneNode(true); duplicate.setAttribute('aria-hidden', 'true');
    track.append(cycle, duplicate);
}).catch(() => { document.getElementById('weather-track').textContent = '天气数据暂不可用'; });
fetchJSON('./notices.json').then(renderNotices).catch(() => {});
