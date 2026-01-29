WidgetMetadata = {
    id: "anime_omni_fix",
    title: "二次元全境聚合",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
    description: "一站式聚合多平台动漫榜单。",
    version: "2.1.1",
    requiredVersion: "0.0.1",
    site: "https://bgm.tv",

    // 0. 全局免 Key
    globalParams: [],

    modules: [
        {
            title: "动漫热榜&周更表",
            functionName: "loadAnimeHub",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "source",
                    title: "选择榜单",
                    type: "enumeration",
                    value: "bili_hot",
                    enumOptions: [
                        // --- Bilibili ---
                        { title: "📺 B站 - 番剧热播 (日漫)", value: "bili_hot" },
                        { title: "📺 B站 - 国创热播 (国漫)", value: "bili_cn" },
                        // --- MyAnimeList ---
                        { title: "🌍 MAL - 历史 Top 100", value: "mal_top" },
                        { title: "🌍 MAL - 当前热播", value: "mal_airing" },
                        { title: "🌍 MAL - 即将上映", value: "mal_upcoming" },
                        { title: "🌍 MAL - 人气最高", value: "mal_bypopularity" },
                        // --- Bangumi ---
                        { title: "🌸 Bangumi - 每日放送 (今天)", value: "bgm_today" },
                        { title: "📅 Bangumi - 周更表 (选日期)", value: "bgm_weekly" }
                    ]
                },
                // 仅对 Bangumi 周更表有效
                {
                    name: "weekday",
                    title: "选择日期 (仅周更表)",
                    type: "enumeration",
                    value: "today",
                    belongTo: { paramName: "source", value: ["bgm_weekly"] },
                    enumOptions: [
                        { title: "周一 (月)", value: "1" },
                        { title: "周二 (火)", value: "2" },
                        { title: "周三 (水)", value: "3" },
                        { title: "周四 (木)", value: "4" },
                        { title: "周五 (金)", value: "5" },
                        { title: "周六 (土)", value: "6" },
                        { title: "周日 (日)", value: "7" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// ==========================================
// 0. 通用配置
// ==========================================
const GENRE_MAP = {
    16: "动画", 10759: "动作冒险", 10765: "科幻奇幻", 35: "喜剧", 18: "剧情",
    9648: "悬疑", 80: "犯罪", 10762: "儿童", 10751: "家庭"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "";
    return ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(" / ");
}

function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    return {
        id: String(id),
        tmdbId: parseInt(tmdbId),
        type: "tmdb",
        mediaType: type,
        title: title,
        genreTitle: [year, genreText].filter(Boolean).join(" • "), 
        subTitle: subTitle,
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : "",
        backdropPath: backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        description: desc || "暂无简介",
        rating: rating,
        year: year
    };
}

// ==========================================
// 1. 核心分发逻辑
// ==========================================

async function loadAnimeHub(params = {}) {
    const { source, page = 1, weekday = "today" } = params;

    // === 1. Bilibili ===
    if (source.startsWith("bili_")) {
        const type = source === "bili_cn" ? 4 : 1; 
        return await fetchBilibiliRankSafe(type, page);
    }

    // === 2. MyAnimeList ===
    if (source.startsWith("mal_")) {
        const type = source.replace("mal_", "");
        return await fetchMalData(type, page);
    }

    // === 3. Bangumi ===
    if (source.startsWith("bgm_")) {
        // bgm_today: 自动今天, bgm_weekly: 手动选
        const day = source === "bgm_today" ? "today" : weekday;
        return await fetchBangumiCalendar(day, page);
    }
}

// ==========================================
// 逻辑 A: Bilibili (Rank API + 本地分页)
// ==========================================

async function fetchBilibiliRankSafe(type, page) {
    const url = `https://api.bilibili.com/pgc/web/rank/list?day=3&season_type=${type}`;
    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/" }
        });
        const data = res.data || {};
        const fullList = data.result?.list || data.data?.list || [];

        const pageSize = 20;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        if (start >= fullList.length) return [];
        
        const slicedList = fullList.slice(start, end);

        const promises = slicedList.map(async (item, index) => {
            const rank = start + index + 1;
            // B站数据
            let finalItem = {
                id: `bili_${item.season_id}`, tmdbId: 0, type: "tv",
                title: item.title, year: "", poster: item.cover, backdrop: "",
                rating: "0.0", genreText: "动画",
                subTitle: `${rank}. ${item.new_ep?.index_show || "热播中"}`,
                desc: item.desc
            };

            const tmdbItem = await searchTmdbInternal(item.title);
            if (tmdbItem) mergeTmdb(finalItem, tmdbItem);
            
            return buildItem(finalItem);
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "B站加载失败" }]; }
}

// ==========================================
// 逻辑 B: MAL (Jikan)
// ==========================================

async function fetchMalData(filterType, page) {
    let url = `https://api.jikan.moe/v4/top/anime?page=${page}`;
    if (filterType !== "top") url += `&filter=${filterType}`;
    
    try {
        const res = await Widget.http.get(url);
        const list = (res.data || {}).data || [];
        if (list.length === 0) return [];

        const promises = list.map(async (item, index) => {
            const rank = (page - 1) * 25 + index + 1;
            const titleEn = item.title_english || item.title;
            
            let finalItem = {
                id: `mal_${item.mal_id}`, tmdbId: 0, type: "tv",
                title: titleEn, year: item.year ? String(item.year) : "", 
                poster: item.images?.jpg?.large_image_url, backdrop: "",
                rating: item.score, genreText: "动画",
                subTitle: `${rank}. MAL ★${item.score}`,
                desc: item.synopsis
            };

            const tmdbItem = await searchTmdbBestMatch(titleEn, item.title_japanese);
            if (tmdbItem) {
                mergeTmdb(finalItem, tmdbItem);
                finalItem.title = tmdbItem.name || tmdbItem.title; // 优先中文名
            }
            return buildItem(finalItem);
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "MAL 加载失败" }]; }
}

// ==========================================
// 逻辑 C: Bangumi (周更表)
// ==========================================

async function fetchBangumiCalendar(weekday, page) {
    const pageSize = 20;
    
    // 计算 Weekday ID
    let targetDayId = parseInt(weekday);
    if (weekday === "today") {
        const today = new Date();
        const jsDay = today.getDay();
        targetDayId = jsDay === 0 ? 7 : jsDay;
    }
    const dayName = getWeekdayName(targetDayId);

    try {
        const res = await Widget.http.get("https://api.bgm.tv/calendar");
        const data = res.data || [];
        const dayData = data.find(d => d.weekday && d.weekday.id === targetDayId);

        if (!dayData || !dayData.items || dayData.items.length === 0) {
            return page === 1 ? [{ id: "empty", type: "text", title: "暂无更新" }] : [];
        }

        const allItems = dayData.items;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        if (start >= allItems.length) return [];
        const pageItems = allItems.slice(start, end);

        const promises = pageItems.map(async (item) => {
            const title = item.name_cn || item.name;
            const subTitle = item.name;
            
            let finalItem = {
                id: `bgm_${item.id}`, tmdbId: 0, type: "tv",
                title: title, year: "", poster: item.images?.large || item.images?.common, backdrop: "",
                rating: item.rating?.score?.toFixed(1) || "0.0",
                genreText: "动画",
                subTitle: subTitle, // 原名
                desc: item.summary
            };

            const tmdbItem = await searchTmdbBestMatch(title, subTitle);
            if (tmdbItem) mergeTmdb(finalItem, tmdbItem);
            
            // 手动覆盖 GenreTitle 为 "周一 • 动画" 格式
            finalItem.genreText = finalItem.genreText || "动画";
            const buildRes = buildItem(finalItem);
            buildRes.genreTitle = `${dayName} • ${finalItem.genreText}`; // 强制前缀
            
            return buildRes;
        });

        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "Bangumi 加载失败" }]; }
}

// ==========================================
// 工具函数
// ==========================================

async function searchTmdbInternal(query) {
    if (!query) return null;
    const cleanQuery = query.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").trim();
    try {
        const res = await Widget.tmdb.get("/search/tv", { params: { query: cleanQuery, language: "zh-CN", page: 1 } });
        return (res.results || [])[0];
    } catch (e) { return null; }
}

async function searchTmdbBestMatch(query1, query2) {
    let res = await searchTmdbInternal(query1);
    if (!res && query2) res = await searchTmdbInternal(query2);
    return res;
}

function mergeTmdb(target, source) {
    target.id = String(source.id);
    target.tmdbId = source.id;
    if (source.poster_path) target.poster = source.poster_path; // buildItem会拼
    if (source.backdrop_path) target.backdrop = source.backdrop_path;
    target.rating = source.vote_average ? source.vote_average.toFixed(1) : target.rating;
    target.year = (source.first_air_date || "").substring(0, 4);
    if (source.overview) target.desc = source.overview;
    target.genreText = getGenreText(source.genre_ids);
}

function getWeekdayName(id) {
    const map = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
    return map[id] || "";
}
