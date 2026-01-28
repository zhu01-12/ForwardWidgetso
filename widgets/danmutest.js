WidgetMetadata = {
    id: "danmu_official_enhanced",
    title: "弹幕获取器 (官方增强)",
    author: "MakkaPakka",
    description: "基于官方模板修复，支持多源并发、季数匹配和繁简转换。",
    version: "2.0.0",
    requiredVersion: "0.0.2",
    globalParams: [
        { name: "server", title: "源1 (必填)", type: "input", value: "https://api.dandanplay.net" },
        { name: "server2", title: "源2", type: "input" },
        { name: "server3", title: "源3", type: "input" },
        { name: "server4", title: "源4", type: "input" }
    ],
    modules: [
        { id: "searchDanmu", title: "搜索", functionName: "searchDanmu", type: "danmu", params: [] },
        { id: "getDetail", title: "详情", functionName: "getDetailById", type: "danmu", params: [] },
        { id: "getComments", title: "弹幕", functionName: "getCommentsById", type: "danmu", params: [] }
    ]
};

// ==========================================
// 1. 基础工具
// ==========================================

function getServers(params) {
    return [params.server, params.server2, params.server3, params.server4]
        .filter(s => s && s.startsWith("http"))
        .map(s => s.replace(/\/$/, ""));
}

async function safeGet(url) {
    try {
        const res = await Widget.http.get(url, { 
            headers: { "Content-Type": "application/json", "User-Agent": "ForwardWidgets/2.0" } 
        });
        const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        return { ok: true, data };
    } catch (e) { return { ok: false }; }
}

function convertChineseNumber(str) {
    if (/^\d+$/.test(str)) return Number(str);
    const map = {'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000,'壹':1,'貳':2,'參':3,'肆':4,'伍':5,'陸':6,'柒':7,'捌':8,'玖':9,'拾':10,'佰':100,'仟':1000};
    let res = 0, curr = 0, lastUnit = 1;
    for (let char of str) {
        if (map[char] < 10) curr = map[char];
        else {
            let unit = map[char];
            if (curr === 0) curr = 1;
            if (unit >= lastUnit) res = curr * unit; else res += curr * unit;
            lastUnit = unit; curr = 0;
        }
    }
    return res + curr;
}

// ==========================================
// 2. 核心功能
// ==========================================

async function searchDanmu(params) {
    const { title, season, type } = params;
    const servers = getServers(params);
    if (!servers.length) return { animes: [] };

    // 并发搜索
    const tasks = servers.map(srv => 
        safeGet(`${srv}/api/v2/search/anime?keyword=${encodeURIComponent(title)}`)
    );
    const results = await Promise.all(tasks);

    let allAnimes = [];
    results.forEach((r, i) => {
        if (r.ok && r.data?.animes) {
            // 标记来源：serverUrl|animeId
            const tagged = r.data.animes.map(a => ({ ...a, animeId: `${servers[i]}|${a.animeId}` }));
            allAnimes = allAnimes.concat(tagged);
        }
    });

    if (allAnimes.length === 0) return { animes: [] };

    // --- 官方过滤逻辑移植 ---
    
    // 1. 类型过滤
    let filtered = allAnimes.filter(a => {
        if (type === "tv") return (a.type === "tvseries" || a.type === "web");
        if (type === "movie") return a.type === "movie";
        return true; 
    });

    // 2. 季数匹配 (这是官方代码最精华的部分)
    if (season) {
        const matched = filtered.filter(a => {
            if (!a.animeTitle.includes(title)) return false;
            // 尝试提取标题后的部分，例如 "xxx 第二季"
            // 简单处理：分割字符串
            const parts = a.animeTitle.split(" ");
            // 遍历每个部分找季数
            for (let part of parts) {
                // 找阿拉伯数字
                const numMatch = part.match(/\d+/);
                if (numMatch && parseInt(numMatch[0]) == season) return true;
                // 找中文数字
                const cnMatch = part.match(/[一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾]+/);
                if (cnMatch && convertChineseNumber(cnMatch[0]) == season) return true;
            }
            // 如果标题完全匹配且 season=1，也算
            if (a.animeTitle.trim() === title.trim() && season == 1) return true;
            
            return false;
        });
        
        // 如果有匹配的季数，优先展示；否则降级展示所有
        if (matched.length > 0) filtered = matched;
    }

    return { animes: filtered };
}

async function getDetailById(params) {
    const { animeId } = params;
    // 解析 ID: server|realId
    const parts = animeId.split('|');
    const realId = parts.pop();
    const server = parts.join('|');

    if (!server) return [];

    const res = await safeGet(`${server}/api/v2/bangumi/${realId}`);
    if (!res.ok || !res.data?.bangumi?.episodes) return [];

    // 给 episodeId 也打上标记
    return res.data.bangumi.episodes.map(ep => ({
        ...ep,
        episodeId: `${server}|${ep.episodeId}`
    }));
}

async function getCommentsById(params) {
    const { commentId } = params;
    if (!commentId) return null;

    const parts = commentId.split('|');
    const realId = parts.pop();
    const server = parts.join('|');

    if (!server) return null;

    // 关键：保留 chConvert=1 (繁简转换)
    const res = await safeGet(`${server}/api/v2/comment/${realId}?withRelated=true&chConvert=1`);
    
    if (!res.ok || !res.data) return null;

    // 返回标准结构
    return res.data;
}
