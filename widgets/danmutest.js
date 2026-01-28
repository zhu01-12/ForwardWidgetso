WidgetMetadata = {
    id: "danmu_ultimate_fix",
    title: "多源弹幕 (兼容版)",
    author: "MakkaPakka",
    description: "基于官方单源逻辑扩展，支持多源自动切换与繁简转换。",
    version: "3.0.0",
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

// --- 内存缓存：记录 animeId 对应的服务器 ---
// 既然不能改 ID 格式，我们就用内存记住 "ID: 12345" 是属于 "Server 2" 的
// 注意：Forward 每次运行可能是独立的，所以利用 Storage 更稳
const SOURCE_MAP_KEY = "danmu_source_map";

async function saveSourceMap(animeId, serverUrl) {
    let map = await Widget.storage.get(SOURCE_MAP_KEY);
    map = map ? JSON.parse(map) : {};
    map[animeId] = serverUrl;
    await Widget.storage.set(SOURCE_MAP_KEY, JSON.stringify(map));
}

async function getSource(animeId) {
    let map = await Widget.storage.get(SOURCE_MAP_KEY);
    map = map ? JSON.parse(map) : {};
    // 如果没有记录，默认用源1
    return map[animeId]; 
}

// --- 核心功能 ---

async function searchDanmu(params) {
    const { title, season, type } = params;
    
    // 获取所有配置的源
    const servers = [params.server, params.server2, params.server3, params.server4]
        .filter(s => s && s.startsWith("http"))
        .map(s => s.replace(/\/$/, ""));

    if (servers.length === 0) return { animes: [] };

    // 并发搜索所有源
    const tasks = servers.map(async (server) => {
        try {
            const res = await Widget.http.get(`${server}/api/v2/search/anime?keyword=${encodeURIComponent(title)}`, {
                headers: { "Content-Type": "application/json", "User-Agent": "ForwardWidgets/2.0" }
            });
            const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
            if (data && data.success && data.animes && data.animes.length > 0) {
                return { server, animes: data.animes };
            }
        } catch (e) {}
        return null;
    });

    const results = await Promise.all(tasks);
    
    // 合并结果
    let finalAnimes = [];
    for (const res of results) {
        if (res) {
            // 为每个结果保存来源映射
            for (const anime of res.animes) {
                // 关键：把 ID 和 Server 的关系存下来
                await saveSourceMap(anime.animeId, res.server);
            }
            finalAnimes = finalAnimes.concat(res.animes);
        }
    }

    // 官方过滤逻辑 (季数匹配)
    if (finalAnimes.length > 0 && season) {
        const matched = finalAnimes.filter(a => {
            if (!a.animeTitle.includes(title)) return false;
            const parts = a.animeTitle.split(" ");
            for (let part of parts) {
                const num = part.match(/\d+/);
                if (num && parseInt(num[0]) == season) return true;
                const cn = part.match(/[一二三四五六七八九十]+/);
                if (cn && convertChineseNumber(cn[0]) == season) return true;
            }
            return (a.animeTitle.trim() === title.trim() && season == 1);
        });
        if (matched.length > 0) finalAnimes = matched;
    }

    return { animes: finalAnimes };
}

async function getDetailById(params) {
    const { animeId } = params;
    
    // 1. 尝试从 Storage 获取该 ID 对应的 Server
    let server = await getSource(animeId);
    // 2. 兜底：如果没找到，用源1
    if (!server) server = params.server;

    try {
        const res = await Widget.http.get(`${server}/api/v2/bangumi/${animeId}`, {
            headers: { "Content-Type": "application/json", "User-Agent": "ForwardWidgets/2.0" }
        });
        const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        
        if (data && data.bangumi && data.bangumi.episodes) {
            // 为每个 episodeId 也保存来源 (通常 episodeId 是独立的，但也可能跟 animeId 在同一个命名空间)
            // 弹弹play 的 episodeId 在获取弹幕时会用到 (作为 commentId)
            for (const ep of data.bangumi.episodes) {
                await saveSourceMap(ep.episodeId, server);
            }
            return data.bangumi.episodes;
        }
    } catch (e) {}
    return [];
}

async function getCommentsById(params) {
    const { commentId } = params;
    if (!commentId) return null;

    // 1. 获取对应的 Server
    let server = await getSource(commentId);
    if (!server) server = params.server;

    try {
        // 2. 请求弹幕 (chConvert=1 开启繁简转换)
        const res = await Widget.http.get(`${server}/api/v2/comment/${commentId}?withRelated=true&chConvert=1`, {
            headers: { "Content-Type": "application/json", "User-Agent": "ForwardWidgets/2.0" }
        });
        const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        return data;
    } catch (e) { return null; }
}

// 辅助：中文数字转阿拉伯
function convertChineseNumber(str) {
    const map = {'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
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
