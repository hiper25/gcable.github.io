// Regional catalogs and immutable, content-addressed schedules.
export async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}

export const state = {
    channels: [], cities: {}, index: null, city: '全网总表', category: '全部',
    view: 'card', sourceGroup: '', filtered: [], byId: new Map(), regionByName: new Map()
};
const schedules = new Map();
const regionCatalogs = new Map();
const epgIndexes = new Map();

export async function loadCatalog() {
    const [channels, index] = await Promise.all([
        fetchJSON('./channels.json?v=25'), fetchJSON('./data_index.json?v=25')
    ]);
    state.channels = channels.filter(channel => channel.rtp);
    state.index = index;
    state.byId = new Map(state.channels.map(channel => [String(channel.channelID), channel]));
    for (const [code, region] of Object.entries(index.regions)) {
        state.regionByName.set(region.name, code);
    }
}

export function loadRegion(code) {
    if (!regionCatalogs.has(code)) {
        regionCatalogs.set(code, fetchJSON('./' + state.index.regions[code].channelsUrl).then(channels => {
            const list = channels.filter(channel => channel.rtp);
            state.cities[state.index.regions[code].name] = list;
            return list;
        }).catch(error => { regionCatalogs.delete(code); throw error; }));
    }
    return regionCatalogs.get(code);
}

export function regionCode() { return state.regionByName.get(state.city); }
export function catalog() {
    return state.city === '全网总表' ? state.channels : (state.cities[state.city] || []);
}
export function regionalChannel(cid, code) {
    const name = state.index.regions[code]?.name;
    return (state.cities[name] || []).find(channel => String(channel.channelID) === String(cid));
}
export function channelRegions(cid) {
    return (state.byId.get(String(cid))?.regionCodes || []).map(String).filter(code => state.index.regions[code]);
}
export function exportsForSelection() {
    return regionCode() ? state.index.regions[regionCode()] : state.index.exports;
}
export async function loadSchedule(cid, code) {
    if (!epgIndexes.has(code)) {
        epgIndexes.set(code, fetchJSON('./' + state.index.regions[code].epgIndexUrl)
            .catch(error => { epgIndexes.delete(code); throw error; }));
    }
    const index = await epgIndexes.get(code);
    const url = index[String(cid)];
    if (!url) return null;
    if (!schedules.has(url)) {
        schedules.set(url, fetchJSON(`./${url}`).catch(error => { schedules.delete(url); throw error; }));
    }
    return schedules.get(url);
}

export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function chinaTime(value) {
    return Date.parse(value.replace(' ', 'T') + (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? '' : '+08:00'));
}
export function chinaDate(offset = 0) {
    return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'})
        .format(new Date(Date.now() - offset * 86400000));
}
export function streamURL(channel) {
    if (channel.gudouUrl) return channel.gudouUrl;
    const bitrate = channel.bitrate || (String(channel.channelID) === '4011' ? '37000' : /4K|超高清/.test(channel.name) ? '36000' : '7500');
    return `http://${channel.node || '172.16.149.220:8070'}/live/${channel.channelID}_${bitrate}.m3u8`;
}
export function replayTemplate(channel) {
    const url = streamURL(channel);
    return `${url}${url.includes('?') ? '&' : '?'}starttime=\${(b)timestamp}&endtime=\${(e)timestamp}`;
}
