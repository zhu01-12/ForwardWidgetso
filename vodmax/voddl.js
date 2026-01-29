WidgetMetadata = {
    id: "universal_stream_global",
    title: "全能播放源 (国际版)",
    author: "MakkaPakka",
    description: "聚合 欧乐/独播库/韩剧看看/FMovies，专为海外/梯子用户设计。",
    version: "2.0.0",
    requiredVersion: "0.0.1",
    
    // 0. 全局免 Key
    globalParams: [],

    modules: [
        {
            id: "loadResource",
            title: "加载资源",
            functionName: "loadResource",
            type: "stream", // 关键：声明为 stream 类型
            params: []
        }
    ]
};

// ==========================================
// 1. 核心分发逻辑
// ==========================================

async function loadResource(params) {
    const { seriesName, type = 'tv', season, episode, title } = params;
    
    // 搜索关键词
    let queryName = seriesName || title;
    
    // 针对国际站，有些需要英文名，有些需要中文名
    // Forward 传过来的通常是中文名。如果 TMDB 有英文名，Forward 会传吗？
    // 通常 Forward 传的是当前显示的标题。
    // 我们主要搜中文名，因为欧乐/独播库都是中文站。
    // FMovies 需要英文名，这里暂时不搜 FMovies，因为它太难搞。

    console.log(`[GlobalStream] Searching: ${queryName} (S${season}E${episode})`);

    const tasks = [
        searchOlevod(queryName, season, episode),
        searchDuboku(queryName, season, episode),
        searchHjkk(queryName, season, episode)
    ];

    const results = await Promise.all(tasks);
    
    // 扁平化并去重
    const flatResults = results.flat().filter(item => item && item.url);
    
    const uniqueMap = new Map();
    flatResults.forEach(item => {
        if (!uniqueMap.has(item.url)) {
            uniqueMap.set(item.url, item);
        }
    });

    return Array.from(uniqueMap.values());
}

// ==========================================
// 2. 欧乐影院 (Olevod)
// ==========================================
const OLE_URL = "https://www.olevod.com";

async function searchOlevod(keyword, season, episode) {
    try {
        // 1. 搜索
        // 欧乐搜索接口: /index.php/vod/search.html?wd=...
        const res = await Widget.http.get(`${OLE_URL}/index.php/vod/search.html?wd=${encodeURIComponent(keyword)}`);
        const $ = Widget.html.load(res.data);
        
        let detailUrl = "";
        // 欧乐搜索结果列表
        $(".module-search-item").each((i, el) => {
            const title = $(el).find(".video-serial").attr("title") || $(el).find("h3 a").text();
            if (title.includes(keyword)) {
                detailUrl = $(el).find(".video-serial").attr("href") || $(el).find("h3 a").attr("href");
                return false;
            }
        });

        if (!detailUrl) return [];
        const fullDetailUrl = `${OLE_URL}${detailUrl}`;

        // 2. 详情页 -> 找播放链接
        const res2 = await Widget.http.get(fullDetailUrl);
        const $2 = Widget.html.load(res2.data);
        
        let playUrl = "";
        const targetEp = episode ? episode.toString() : "1";

        // 欧乐的播放列表: .module-play-list-content a
        $2(".module-play-list-content a").each((i, el) => {
            const text = $2(el).text();
            // 匹配 "第1集"
            if (!season) { playUrl = $2(el).attr("href"); return false; } // 电影
            
            const num = text.match(/\d+/);
            if (num && parseInt(num[0]) == targetEp) {
                playUrl = $2(el).attr("href");
                return false;
            }
        });

        if (!playUrl) return [];
        const fullPlayUrl = `${OLE_URL}${playUrl}`;

        // 3. 播放页 -> 找 m3u8
        const res3 = await Widget.http.get(fullPlayUrl);
        // 欧乐通常把 url 放在 player_aaaa 或者是 script 里的 "url": "..."
        const match = res3.data.match(/"url":"([^"]+)"/);
        
        if (match && match[1]) {
            let vUrl = match[1].replace(/\\/g, "");
            return [{
                name: "欧乐影院 (国际)",
                description: "Olevod 直连",
                url: vUrl,
                headers: { "Referer": OLE_URL, "User-Agent": "Mozilla/5.0" }
            }];
        }

    } catch (e) {}
    return [];
}

// ==========================================
// 3. 独播库 (Duboku)
// ==========================================
const DUBOKU_URL = "https://www.duboku.tv";

async function searchDuboku(keyword, season, episode) {
    try {
        const res = await Widget.http.get(`${DUBOKU_URL}/vod/search.html?wd=${encodeURIComponent(keyword)}`);
        const $ = Widget.html.load(res.data);
        
        let detailUrl = "";
        $(".module-item").each((i, el) => {
            const title = $(el).find(".module-item-title").text();
            if (title.includes(keyword)) {
                detailUrl = $(el).find("a").attr("href");
                return false;
            }
        });

        if (!detailUrl) return [];
        const fullDetailUrl = `${DUBOKU_URL}${detailUrl}`;

        const res2 = await Widget.http.get(fullDetailUrl);
        const $2 = Widget.html.load(res2.data);
        
        let playUrl = "";
        const targetEp = episode ? episode.toString() : "1";

        $2(".module-play-list-content a").each((i, el) => {
            const text = $2(el).text();
            if (!season) { playUrl = $2(el).attr("href"); return false; }
            const num = text.match(/\d+/);
            if (num && parseInt(num[0]) == targetEp) {
                playUrl = $2(el).attr("href");
                return false;
            }
        });

        if (!playUrl) return [];
        const fullPlayUrl = `${DUBOKU_URL}${playUrl}`;

        const res3 = await Widget.http.get(fullPlayUrl);
        // 独播库也是 CMS 结构
        const match = res3.data.match(/"url":"([^"]+)"/);
        
        if (match && match[1]) {
            let vUrl = match[1].replace(/\\/g, "");
            return [{
                name: "独播库 (国际)",
                description: "Duboku 直连",
                url: vUrl,
                headers: { "Referer": DUBOKU_URL }
            }];
        }
    } catch (e) {}
    return [];
}

// ==========================================
// 4. 韩剧看看 (Hjkk)
// ==========================================
const HJKK_URL = "https://www.hanjukankan.com";

async function searchHjkk(keyword, season, episode) {
    try {
        const res = await Widget.http.get(`${HJKK_URL}/hanju/search.html?wd=${encodeURIComponent(keyword)}`);
        const $ = Widget.html.load(res.data);
        
        let detailUrl = "";
        $(".module-search-item").each((i, el) => {
            const title = $(el).find(".video-serial").attr("title");
            if (title && title.includes(keyword)) {
                detailUrl = $(el).find(".video-serial").attr("href");
                return false;
            }
        });

        if (!detailUrl) return [];
        const fullDetailUrl = `${HJKK_URL}${detailUrl}`;

        const res2 = await Widget.http.get(fullDetailUrl);
        const $2 = Widget.html.load(res2.data);
        
        let playUrl = "";
        const targetEp = episode ? episode.toString() : "1";

        $2(".module-play-list-content a").each((i, el) => {
            const text = $2(el).text();
            if (!season) { playUrl = $2(el).attr("href"); return false; }
            const num = text.match(/\d+/);
            if (num && parseInt(num[0]) == targetEp) {
                playUrl = $2(el).attr("href");
                return false;
            }
        });

        if (!playUrl) return [];
        const fullPlayUrl = `${HJKK_URL}${playUrl}`;

        const res3 = await Widget.http.get(fullPlayUrl);
        const match = res3.data.match(/"url":"([^"]+)"/);
        
        if (match && match[1]) {
            let vUrl = match[1].replace(/\\/g, "");
            return [{
                name: "韩剧看看 (国际)",
                description: "Hjkk 直连",
                url: vUrl,
                headers: { "Referer": HJKK_URL }
            }];
        }
    } catch (e) {}
    return [];
}
