import {state, catalog, escapeHTML as esc, regionCode, exportsForSelection, loadRegion} from './data.js?v=25';
import {getChannelIconHTML} from './icons.js?v=25';
import {showToast} from './ui.js?v=25';
import {openPicker} from './picker.js?v=25';

const cards = new Map();
const rows = new Map();
let onOpen;
let onCopy;
let renderFrame = 0;
let cityRequest = 0;

function replayLabel(channel) {
    if (channel.isTVAnyTime === '1') return '<span class="badge-timeshift"><span class="dot" style="background:var(--accent);"></span>支持7天时移</span>';
    if (channel.hasEPG) return '<span class="badge-timeshift" style="color:var(--rtp-color);">含节目单 · 无回看</span>';
    return '<span class="badge-live-only">仅直播</span>';
}
function content(channel, table) {
    const name = esc(channel.name), cid = esc(channel.channelID), number = esc(channel.channelNumber), category = esc(channel.category);
    const rtp = `<span class="rtp-code">${esc(channel.rtp)}</span><button class="btn btn-sm" data-action="copy">${table ? '复制' : '复制组播'}</button>`;
    const details = '<button class="btn btn-sm" data-action="details">查看详情 ➔</button>';
    if (table) return `<td class="ch-no">#${number}</td><td><div style="display:flex;align-items:center;gap:10px;">${getChannelIconHTML(channel)}<span style="font-weight:700;">${name}</span></div></td><td><span class="pill-cat">${category}</span></td><td class="pill-id">${cid}</td><td><div style="display:flex;align-items:center;gap:8px;">${rtp}</div></td><td>${replayLabel(channel)}</td><td style="text-align:right;">${details}</td>`;
    return `<div class="ch-top">${getChannelIconHTML(channel)}<div class="ch-info"><div class="ch-title-row"><div class="ch-name" title="${name}">${name}</div><span class="ch-no">#${number}</span></div><div class="ch-tags"><span class="pill-cat">${category}</span><span class="pill-id">ID:${cid}</span></div></div></div><div class="rtp-strip">${rtp}</div><div class="ch-bottom">${replayLabel(channel)}${details}</div>`;
}

// Keep matching nodes connected. Moving every card through a detached fragment restarts image rendering.
function reconcile(container, channels, pool, table) {
    const wanted = new Set(channels.map(channel => String(channel.channelID)));
    for (const child of Array.from(container.children)) if (!wanted.has(child.dataset.cid)) child.remove();
    let cursor = container.firstElementChild;
    for (const channel of channels) {
        const cid = String(channel.channelID);
        let item = pool.get(cid);
        if (!item) {
            item = document.createElement(table ? 'tr' : 'div');
            if (!table) item.className = 'ch-card';
            item.dataset.cid = cid;
            item.innerHTML = content(channel, table);
            pool.set(cid, item);
        } else {
            const previous = item.channel;
            if (previous.name !== channel.name || previous.rtp !== channel.rtp || previous.category !== channel.category || previous.hasEPG !== channel.hasEPG || previous.isTVAnyTime !== channel.isTVAnyTime) {
                item.innerHTML = content(channel, table);
            } else if (previous.channelNumber !== channel.channelNumber) {
                item.querySelector('.ch-no').textContent = `#${channel.channelNumber}`;
            }
        }
        item.channel = channel;
        if (item !== cursor) container.insertBefore(item, cursor);
        cursor = item.nextElementSibling;
    }
    if (!channels.length) {
        const empty = document.createElement(table ? 'tr' : 'div');
        if (table) { const cell = empty.insertCell(); cell.colSpan = 7; cell.textContent = '未找到符合条件的频道，可清空搜索或重置筛选。'; }
        else { empty.style.gridColumn = '1/-1'; empty.textContent = '未找到符合条件的频道，可清空搜索或重置筛选。'; }
        container.append(empty);
    }
}

function matchesKeyword(channel, keyword) {
    return [channel.name, channel.channelNumber, channel.channelID, channel.rtp,
        ...(channel.sourceNames || []).map(source => source.name)]
        .some(value => String(value ?? '').toLowerCase().includes(keyword));
}

export function applyFilters() {
    const keyword = document.getElementById('search-kw').value.toLowerCase().trim();
    const onlyReplay = document.getElementById('only-replay').checked;
    const source = catalog();
    state.filtered = source.filter(channel => (!onlyReplay || channel.isTVAnyTime === '1') &&
        (state.category === '全部' || channel.category === state.category) &&
        (!state.sourceGroup || channel.sourceGroups?.includes(state.sourceGroup)) &&
        (!keyword || matchesKeyword(channel, keyword)));
    document.getElementById('match-count').textContent = state.filtered.length;
    document.getElementById('search-scope').textContent = `搜索范围：${state.city} · ${state.category}${state.sourceGroup ? ` · ${state.sourceGroup}` : ''}${onlyReplay ? ' · 支持时移' : ''}；包含源站地区别名`;
    document.getElementById('active-filter-summary').textContent = `${state.city} · ${state.category}${state.sourceGroup ? ` · ${state.sourceGroup}` : ''}${onlyReplay ? ' · 支持时移' : ''}`;
    document.getElementById('search-clear').hidden = !document.getElementById('search-kw').value;
    document.getElementById('reset-filters').hidden = !keyword && state.category === '全部' && !state.sourceGroup && !onlyReplay;
    const limited = regionCode() || state.category !== '全部' || state.sourceGroup || onlyReplay;
    const globalMatches = keyword && limited ? state.channels.filter(channel => matchesKeyword(channel, keyword)).length : 0;
    const globalSearch = document.getElementById('search-global');
    globalSearch.hidden = globalMatches <= state.filtered.length;
    globalSearch.textContent = `全网查找（${globalMatches}）`;
    document.getElementById('summary-total').textContent = source.length;
    document.getElementById('summary-rtp').textContent = source.filter(channel => channel.rtp).length;
    const count = regionCode() ? state.index.regions[regionCode()].programmes : state.index.totals.programmes;
    document.getElementById('summary-epg').textContent = Number(count || 0).toLocaleString('zh-CN') + ' 条';
    const coverage = document.getElementById('data-coverage');
    const region = regionCode() ? state.index.regions[regionCode()] : null;
    coverage.textContent = region ? `${state.city} · ${region.epgStatus === 'ok' ? 'EPG 已采集' : 'EPG 部分缺失'}` : `${Object.keys(state.index.regions).length} 个区域`;
    coverage.title = `采集更新：${state.index.updatedAt}；节目数含源站占位。总表按频道和不同地区节目单去重，地区表只统计当前地区。`;
    document.getElementById('summary-epg').title = region ? '当前地区节目单记录，包含源站占位' : '总 XMLTV 节目记录；同频道相同地区节目单仅计一次，跨频道保留对应关系';
    const counts = new Map();
    for (const channel of source) counts.set(channel.category, (counts.get(channel.category) || 0) + 1);
    document.querySelectorAll('#cat-pills [data-cat]').forEach(button => {
        const category = button.dataset.cat;
        const label = `${category} (${category === '全部' ? source.length : counts.get(category) || 0})`;
        if (button.textContent !== label) button.textContent = label;
        button.classList.toggle('active', category === state.category);
        button.setAttribute('aria-pressed', String(category === state.category));
    });
    document.querySelectorAll('#city-pills [data-city]').forEach(button => {
        button.classList.toggle('active', button.dataset.city === state.city);
        button.setAttribute('aria-pressed', String(button.dataset.city === state.city));
    });
    const regionLabel = !region ? '查找其他频道' : region.name.startsWith('区域 ') ? `未命名配置 ${regionCode()}` : `${region.name} · ${regionCode()}`;
    document.querySelector('#district-select .picker-trigger-text').textContent = regionLabel;
    document.querySelector('#source-group-select .picker-trigger-text').textContent = state.sourceGroup || '全部分组';
    const playlist = './' + exportsForSelection().playlistUrl;
    for (const download of document.querySelectorAll('[data-playlist-download]')) download.href = playlist;
    reconcile(document.getElementById(state.view === 'card' ? 'channels-grid' : 'channels-table-body'), state.filtered, state.view === 'card' ? cards : rows, state.view === 'table');
}
export function scheduleFilter() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(applyFilters);
}

function revealSelectedChip(id) {
    const strip = document.getElementById(id);
    const selected = strip.querySelector('.active');
    if (!selected || strip.scrollWidth <= strip.clientWidth) return;
    const bounds = strip.getBoundingClientRect(), item = selected.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
}

export function setCategory(category) {
    if (state.category === category) return;
    state.category = category;
    applyFilters();
    revealSelectedChip('cat-pills');
}
export async function setCity(city) {
    const request = ++cityRequest;
    if (state.city === city) return;
    try {
        if (city !== '全网总表') await loadRegion(state.regionByName.get(city));
        if (request !== cityRequest) return;
        state.city = city;
        ensureCategoryButtons(catalog());
        updateSourceGroups();
        applyFilters();
        revealSelectedChip('city-pills');
        revealSelectedChip('cat-pills');
    } catch {
        if (request === cityRequest) showToast('该地区频道表载入失败，请重试');
    }
}
export function switchView(view) {
    if (state.view === view) return;
    state.view = view;
    document.getElementById('btn-view-card').classList.toggle('active', view === 'card');
    document.getElementById('btn-view-table').classList.toggle('active', view === 'table');
    document.getElementById('btn-view-card').setAttribute('aria-pressed', String(view === 'card'));
    document.getElementById('btn-view-table').setAttribute('aria-pressed', String(view === 'table'));
    document.getElementById('channels-grid').style.display = view === 'card' ? 'grid' : 'none';
    document.getElementById('channels-table-wrap').style.display = view === 'table' ? 'block' : 'none';
    applyFilters();
}
export function initChannels(open, copy) {
    onOpen = open; onCopy = copy;
    document.getElementById('channels-grid').replaceChildren();
    for (const id of ['channels-grid', 'channels-table-body']) document.getElementById(id).addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const channel = button.closest('[data-cid]').channel;
        if (button.dataset.action === 'details') onOpen(channel);
        else onCopy(button, channel.rtp, '已复制组播地址');
    });
    const cities = document.getElementById('city-pills');
    cities.replaceChildren();
    const cityOrder = ['广州','深圳','珠海','佛山','东莞','中山','江门','惠州','肇庆','汕头','潮州','揭阳','汕尾','湛江','茂名','阳江','韶关','清远','梅州','河源','云浮'];
    for (const name of ['全网总表', ...cityOrder.filter(name => state.regionByName.has(name))]) {
        const button = document.createElement('button');
        button.className = 'city-btn'; button.dataset.city = name; button.type = 'button';
        const code = state.regionByName.get(name);
        button.textContent = name + (code ? ` (${code})` : ` (${state.channels.length})`);
        button.onclick = () => setCity(name);
        cities.append(button);
    }
    initRegionPicker();
    document.getElementById('search-clear').onclick = () => {
        const search = document.getElementById('search-kw');
        search.value = '';
        applyFilters();
        search.focus({preventScroll:true});
    };
    document.getElementById('reset-filters').onclick = () => {
        state.category = '全部';
        state.sourceGroup = '';
        document.getElementById('search-kw').value = '';
        document.getElementById('only-replay').checked = false;
        applyFilters();
        revealSelectedChip('cat-pills');
        document.getElementById('search-kw').focus({preventScroll:true});
    };
    document.getElementById('search-global').onclick = async () => {
        state.category = '全部';
        state.sourceGroup = '';
        document.getElementById('only-replay').checked = false;
        await setCity('全网总表');
        applyFilters();
    };
    document.getElementById('source-group-select').onclick = event => {
        const source = catalog();
        const counts = new Map();
        for (const channel of source) for (const group of channel.sourceGroups || []) counts.set(group, (counts.get(group) || 0) + 1);
        openPicker({trigger:event.currentTarget, title:'选择源站分组',
            description:'源站分组按当前地区的原始资料显示，可与内容分类和搜索组合筛选。', selected:state.sourceGroup,
            options:[{value:'', label:'全部分组', detail:`${source.length} 个频道`},
                ...Array.from(counts, ([group, count]) => ({value:group, label:group, detail:`${count} 个频道`}))],
            onSelect:value => { state.sourceGroup = value; applyFilters(); }
        });
    };
    updateSourceGroups();
    ensureCategoryButtons(catalog());
    applyFilters();
}

function updateSourceGroups() {
    if (!catalog().some(channel => channel.sourceGroups?.includes(state.sourceGroup))) state.sourceGroup = '';
}

function initRegionPicker() {
    const groups = state.index.regionGroups;
    const byCode = new Map(groups.flatMap(group => group.codes.map(code => [code, group])));
    const channelName = id => state.byId.get(id)?.name || `频道 ${id}`;
    const picker = document.getElementById('district-select');
    picker.onclick = () => {
        const current = regionCode();
        function option(group, exactCode) {
            const code = exactCode ?? (group.codes.includes(current) ? current : group.representativeCode);
            const knownNames = group.knownCityCodes.map(value => state.index.regions[value].name);
            const extra = group.extraChannelIds;
            const samples = (extra.length ? extra : group.channelIds).slice(0,3).map(channelName).join('、');
            const label = exactCode ? `${state.index.regions[code].name.startsWith('区域 ') ? '未命名编码' : state.index.regions[code].name} · ${code}`
                : knownNames.length ? `${knownNames.join(' / ')} · 相同数据配置` : `未命名配置 ${group.representativeCode}`;
            return {value:code, label,
                detail:`${group.channelIds.length} 个频道${extra.length ? ` · ${extra.length} 个地市表外频道` : ''} · ${group.codes.length} 个同数据编码\n${samples}`,
                keywords:[...group.codes,...knownNames,...group.channelIds.map(id => `${id} ${channelName(id)} ${(state.byId.get(id)?.sourceNames || []).map(source => source.name).join(' ')}`)].join(' ')};
        }
        const additional = groups.filter(group => group.extraChannelIds.length).map(group => option(group));
        const distinct = groups.map(group => option(group));
        const original = Object.keys(state.index.regions).map(code => option(byCode.get(code), code));
        openPicker({trigger:picker, title:'查找其他频道配置', selected:current,
            description:'这些是源站业务编码，不一定是区县。相同频道、频点和节目单合并展示，不代表地理归属；原始编码仍全部保留。可搜索频道名、ID 或编码。',
            options:distinct, views:[
                {id:'additional', label:`额外频道 (${additional.length})`, options:additional},
                {id:'distinct', label:`全部配置 (${distinct.length})`, options:distinct},
                {id:'original', label:`原始编码 (${original.length})`, options:original}
            ],
            onSelect:async code => { const name = state.index.regions[code].name; await setCity(name); return state.city === name; }
        });
    };
}

function ensureCategoryButtons(channels) {
    const existing = new Set(Array.from(document.querySelectorAll('#cat-pills [data-cat]'), button => button.dataset.cat));
    for (const category of new Set(channels.map(channel => channel.category))) {
        if (existing.has(category)) continue;
        const button = document.createElement('button');
        button.className = 'cat-btn'; button.dataset.cat = category; button.type = 'button';
        button.onclick = () => setCategory(category);
        document.getElementById('cat-pills').append(button);
        existing.add(category);
    }
}
