WidgetMetadata = {
    id: "anime_omni_hub",
    title: "二次元全境聚合",
    author: "MakkaPakka",
    description: "聚合 MyAnimeList(全球)、Bangumi(国内硬核)、Bilibili(热播) 三大榜单。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://myanimelist.net",

    // 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于匹配高清海报和背景。",
            value: ""
        }
    ],

    modules: [
        {
            title: "动漫热榜",
            functionName: "loadAnimeHub",
            type: "video",
            cacheDuration: 7200, // 2小时缓存
            params: [
                {
                    name: "source",
                    title: "选择榜单",
                    type: "enumeration",
                    value: "mal_top",
                    enumOptions: [
                        // --- MyAnimeList (全球) ---
                        { title: "🌍 MAL - 历史 Top 100", value: "mal_top" },
                        { title: "🌍 MAL - 当前热播 (Airing)", value: "mal_airing" },
                        { title: "🌍 MAL - 即将上映 (Upcoming)", value: "mal_upcoming" },
                        { title: "🌍 MAL - 人气最高 (Popularity)", value: "mal_bypopularity" },
                        // --- Bangumi (国内硬核) ---
                        { title: "🌸 Bangumi - 每日放送", value: "bgm_calendar" },
                        // --- Bilibili (国内大众) ---
                        { title: "📺 B站 - 番剧热播", value: "bili_hot" },
                        { title: "📺 B站 - 国创热播", value: "bili_cn" }
                    ]
                }
            ]
        }
    ]
};

async function loadAnimeHub(params = {}) {
    const { apiKey, source } = params;
    if (!apiKey) return [{ id: "err", type: "text", title: "请填写 TMDB API Key" }];

    // === 1. MyAnimeList (Jikan API) ===
    if (source.startsWith("mal_")) {
        const type = source.replace("mal_", ""); // top, airing, upcoming...
        return await fetchMalData(type, apiKey);
    }

    // === 2. Bangumi ===
    if (source.startsWith("bgm_")) {
        return await fetchBangumiCalendar(apiKey);
    }

    // === 3. Bilibili ===
    if (source.startsWith("bili_")) {
        const type = source === "bili_cn" ? 4 : 1; // 4=国创, 1=番剧
        return await fetchBilibiliRank(type, apiKey);
    }
}

// ==========================================
// 逻辑 A: MyAnimeList (via Jikan API)
// ==========================================

async function fetchMalData(filterType, apiKey) {
    // Jikan API: https://api.jikan.moe/v4/top/anime?filter=...
    let url = "https://api.jikan.moe/v4/top/anime";
    
    // 映射 filter 参数
    // MAL API 默认为 top (rank)
    if (filterType === "airing") url += "?filter=airing";
    else if (filterType === "upcoming") url += "?filter=upcoming";
    else if (filterType === "bypopularity") url += "?filter=bypopularity";
    
    console.log(`[MAL] Fetching: ${url}`);

    try {
        const res = await Widget.http.get(url);
        const data = res.data || {};
        const list = data.data || [];

        if (list.length === 0) return [{ id: "empty", type: "text", title: "MAL 无数据" }];

        // 并发匹配 TMDB (MAL 标题通常是罗马音或英文，需匹配)
        const promises = list.slice(0, 15).map(async (item, index) => {
            const titleEn = item.title_english || item.title;
            const titleJp = item.title_japanese;
            
            // 构造默认项
            let finalItem = {
                id: `mal_${item.mal_id}`,
                type: "tmdb", 
                mediaType: "tv",
                title: `${index + 1}. ${titleEn}`, // 默认显示英文名
                subTitle: `MAL ★${item.score || "N/A"} | 👥 ${item.members}`,
                posterPath: item.images?.jpg?.large_image_url || "",
                year: item.year ? String(item.year) : "",
                description: item.synopsis
            };

            // 去 TMDB 找中文资料
            // 优先搜英文名，其次日文名
            const tmdbItem = await searchTmdbBestMatch(titleEn, titleJp, apiKey);
            
            if (tmdbItem) {
                finalItem.id = String(tmdbItem.id);
                finalItem.tmdbId = tmdbItem.id;
                finalItem.title = `${index + 1}. ${tmdbItem.name || tmdbItem.title}`; // 换成中文名
                finalItem.posterPath = tmdbItem.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}` : finalItem.posterPath;
                finalItem.backdropPath = tmdbItem.backdrop_path ? `https://image.tmdb.org/t/p/w780${tmdbItem.backdrop_path}` : "";
                finalItem.rating = tmdbItem.vote_average.toFixed(1);
                // 简介保留 MAL 的还是用 TMDB 的？TMDB 中文简介更好
                if (tmdbItem.overview) finalItem.description = tmdbItem.overview;
            }
            return finalItem;
        });

        return await Promise.all(promises);

    } catch (e) {
        return [{ id: "err_mal", type: "text", title: "MAL 连接失败", subTitle: e.message }];
    }
}

// ==========================================
// 逻辑 B: Bangumi & Bilibili (复用之前逻辑)
// ==========================================

async function fetchBangumiCalendar(apiKey) {
    try {
        const res = await Widget.http.get("https://api.bgm.tv/calendar");
        const data = res.data || [];
        const dayIndex = new Date().getDay();
        const bgmDayId = dayIndex === 0 ? 7 : dayIndex;
        const todayData = data.find(d => d.weekday.id === bgmDayId);

        if (!todayData || !todayData.items) return [{ id: "empty", type: "text", title: "今日无放送" }];

        const promises = todayData.items.map(async item => {
            const name = item.name_cn || item.name;
            let finalItem = {
                id: `bgm_${item.id}`, type: "tmdb", mediaType: "tv",
                title: name, subTitle: item.name, posterPath: item.images?.large
            };
            const tmdb = await searchTmdbBestMatch(name, item.name, apiKey);
            if (tmdb) mergeTmdb(finalItem, tmdb);
            return finalItem;
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err_bgm", type: "text", title: "Bangumi 错误" }]; }
}

async function fetchBilibiliRank(type, apiKey) {
    try {
        const res = await Widget.http.get(`https://api.bilibili.com/pgc/web/rank/list?day=3&season_type=${type}`);
        const list = (res.data?.result?.list || res.data?.data?.list || []).slice(0, 15);
        
        const promises = list.map(async (item, i) => {
            let finalItem = {
                id: `bili_${i}`, type: "tmdb", mediaType: "tv",
                title: `${i+1}. ${item.title}`, subTitle: item.new_ep?.index_show, posterPath: item.cover
            };
            const tmdb = await searchTmdbBestMatch(item.title, "", apiKey);
            if (tmdb) mergeTmdb(finalItem, tmdb);
            return finalItem;
        });
        return await Promise.all(promises);
    } catch (e) { return []; }
}

// ==========================================
// 核心工具: 智能匹配
// ==========================================

async function searchTmdbBestMatch(query1, query2, apiKey) {
    // 策略：先搜 Query1 (通常是英/中文)，如果没有结果，搜 Query2 (通常是原名)
    let res = await searchTmdb(query1, apiKey);
    if (!res && query2) {
        res = await searchTmdb(query2, apiKey);
    }
    return res;
}

async function searchTmdb(query, apiKey) {
    if (!query) return null;
    const cleanQuery = query.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").trim();
    const url = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(cleanQuery)}&language=zh-CN&page=1`;
    try {
        const res = await Widget.http.get(url);
        return (res.data?.results || [])[0];
    } catch (e) { return null; }
}

function mergeTmdb(target, source) {
    target.id = String(source.id);
    target.tmdbId = source.id;
    target.posterPath = source.poster_path ? `https://image.tmdb.org/t/p/w500${source.poster_path}` : target.posterPath;
    target.backdropPath = source.backdrop_path ? `https://image.tmdb.org/t/p/w780${source.backdrop_path}` : "";
    target.year = (source.first_air_date || source.release_date || "").substring(0, 4);
    target.description = source.overview;
    target.rating = source.vote_average.toFixed(1);
    target.title = source.name || source.title || target.title; // 替换为标准中文名
}
