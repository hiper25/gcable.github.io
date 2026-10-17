import {escapeHTML} from './data.js?v=25';
export function getChannelIconHTML(channel) {
    const ch = {...channel, name: escapeHTML(channel.name), category: escapeHTML(channel.category), channelID: escapeHTML(channel.channelID)};
    const cid = ch.channelID;
    const name = ch.name;
    const cat = ch.category || '综合';
    const imgPath = `./logos/${cid}.png`;
    
    let bg = 'linear-gradient(135deg, #0284c7, #0369a1)';
    let label = cat;
    if (name.includes('导视')) {
        bg = 'linear-gradient(135deg, #0284c7, #075985)';
        label = '导视';
    } else if (name.includes('4K') || name.includes('超高清')) {
        bg = 'linear-gradient(135deg, #dc2626, #991b1b)';
        const m = name.match(/CCTV-?(\d+\+?)/i);
        label = m ? 'CCTV' + m[1] : '央视';
    } else if (name.includes('卫视')) {
        bg = 'linear-gradient(135deg, #2563eb, #1e40af)';
        label = name.replace(/卫视.*/, '').slice(0, 2);
    } else if (name.includes('翡翠台')) {
        bg = 'linear-gradient(135deg, #059669, #065f46)';
        label = '翡翠';
    } else if (name.includes('明珠台')) {
        bg = 'linear-gradient(135deg, #d97706, #92400e)';
        label = '明珠';
    } else if (name.includes('阳江') || name.includes('阳东') || name.includes('阳春') || name.includes('阳西')) {
        bg = 'linear-gradient(135deg, #0284c7, #075985)';
        label = '阳江';
    } else if (name.includes('广州') || name.includes('佛山') || name.includes('南海') || name.includes('顺德')) {
        bg = 'linear-gradient(135deg, #0e7490, #155e75)';
        label = '广佛';
    } else if (name.includes('电影') || name.includes('影院') || name.includes('CHC') || name.includes('DOX') || name.includes('求索')) {
        bg = 'linear-gradient(135deg, #701a75, #4a044e)';
        label = '影院';
    } else if (name.includes('体育') || name.includes('足球') || name.includes('乒羽')) {
        bg = 'linear-gradient(135deg, #16a34a, #14532d)';
        label = '体育';
    } else if (name.includes('广播') || name.includes('电台') || name.includes('之声')) {
        bg = 'linear-gradient(135deg, #7c3aed, #5b21b6)';
        label = 'FM';
    } else if (name.includes('测试')) {
        bg = 'linear-gradient(135deg, #e11d48, #9f1239)';
        label = '测试';
    } else {
        if (label.length > 2) label = label.slice(0, 2);
    }

    if (ch.hasLogo !== false) {
        return `
            <img class="ch-icon-img" src="${imgPath}" alt="${name}" loading="lazy" width="44" height="32"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="emblem" style="background:${bg}; display:none;">
                <span>${label}</span>
            </div>
        `;
    } else {
        return `
            <div class="emblem" style="background:${bg}; display:flex;">
                <span>${label}</span>
            </div>
        `;
    }
}
