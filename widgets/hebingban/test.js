WidgetMetadata = {
    id: "anime_omni_fix_v2.1",
    title: "二次元全境聚合 (Bangumi修复)",
    author: "MakkaPakka",
    description: "增强了 Bangumi 的 TMDB 匹配成功率，未匹配项目支持跳转。",
    version: "2.2.0",
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
                    value: "bgm_today", // 默认改成 Bangumi 方便测试
                    enumOptions: [
                        { title: "🌸 Bangumi - 每日放送 (今天)", value: "bgm_today" },
                        { title: "📅 Bangumi - 周更表 (选日期)", value: "bgm_weekly" },
                        { title: "📺 B站 - 番剧热播", value: "bili_hot" },
                        { title: "📺 B站 - 国创热播", value: "bili_cn" },
                        { title: "🌍 MAL - 历史 Top 100", value: "mal_top" },
                        { title: "🌍 MAL - 当前热播", value: "mal_airing" }
                    ]
                },
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
    16: "动画", 10759: "动作冒险", 10765: "科幻奇幻", 35: "喜剧", 18: "剧情", 9648: "悬疑", 80: "犯罪", 10762: "儿童", 10751: "家庭"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "";
    return ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(" / ");
}

function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc, link }) {
    // 智能处理海报：如果是 http 开头则保留，否则拼 TMDB
    const fullPoster = poster && poster.startsWith("http") ? poster : (poster ? `https://image.tmdb.org/t/p/w500${poster}` : "");
    const fullBackdrop = backdrop && backdrop.startsWith("http") ? backdrop : (backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "");

    return {
        id: String(id),
        tmdbId: parseInt(tmdbId) || 0,
        type: type, // tmdb 或 link
        mediaType: "tv",
        title: title,
        genreTitle: [year, genreText].filter(Boolean).join(" • "), 
        subTitle: subTitle,
        posterPath: fullPoster,
        backdropPath: fullBackdrop,
        description: desc || "暂无简介",
        rating: rating,
        year: year,
        link: link // 仅当 type="link" 时有效
    };
}

// ==========================================
// 1. 核心分发
// ==========================================
async function loadAnimeHub(params = {}) {
    const { source, page = 1, weekday = "today" } = params;
    if (source.startsWith("bili_")) return await fetchBilibiliRankSafe(source === "bili_cn" ? 4 : 1, page);
    if (source.startsWith("mal_")) return await fetchMalData(source.replace("mal_", ""), page);
    if (source.startsWith("bgm_")) return await fetchBangumiCalendar(source === "bgm_today" ? "today" : weekday, page);
}

// ==========================================
// 逻辑 C: Bangumi (周更表) - 强力修复
// ==========================================
async function fetchBangumiCalendar(weekday, page) {
    const pageSize = 20;
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
            const titleCn = item.name_cn || "";
            const titleJp = item.name || "";
            const title = titleCn || titleJp; // 优先中文名用于展示
            
            // 初始数据 (Bangumi)
            let finalItem = {
                id: `bgm_${item.id}`,
                tmdbId: 0,
                type: "link", // 默认降级为 link，防止无法点击
                link: `https://bgm.tv/subject/${item.id}`, // 跳转 Bangumi 网页
                title: title,
                year: "",
                poster: item.images?.large || item.images?.common || "",
                rating: item.rating?.score?.toFixed(1) || "0.0",
                genreText: "动画",
                subTitle: titleJp !== title ? titleJp : "", // 副标题显示原名
                desc: item.summary
            };

            // 强力匹配 TMDB
            // 策略：中文名 -> 原名 -> 清洗后的中文名 (去掉第x季) -> 清洗后的原名
            const cleanCn = cleanTitle(titleCn);
            const cleanJp = cleanTitle(titleJp);
            
            let tmdbItem = await searchTmdbInternal(titleCn);
            if (!tmdbItem && titleJp) tmdbItem = await searchTmdbInternal(titleJp);
            if (!tmdbItem && cleanCn !== titleCn) tmdbItem = await searchTmdbInternal(cleanCn);
            if (!tmdbItem && cleanJp !== titleJp) tmdbItem = await searchTmdbInternal(cleanJp);

            if (tmdbItem) {
                // 匹配成功！升级为 TMDB Item
                finalItem.type = "tmdb";
                finalItem.id = String(tmdbItem.id);
                finalItem.tmdbId = tmdbItem.id;
                finalItem.poster = tmdbItem.poster_path; // 这里的相对路径会在 buildItem 里处理
                finalItem.backdrop = tmdbItem.backdrop_path;
                finalItem.rating = tmdbItem.vote_average ? tmdbItem.vote_average.toFixed(1) : finalItem.rating;
                finalItem.year = (tmdbItem.first_air_date || "").substring(0, 4);
                if (tmdbItem.overview) finalItem.desc = tmdbItem.overview;
                finalItem.genreText = getGenreText(tmdbItem.genre_ids);
                // 标题修正：使用 TMDB 的规范中文名
                finalItem.title = tmdbItem.name || finalItem.title;
            }
            
            // 强制加上周几前缀
            const buildRes = buildItem(finalItem);
            buildRes.genreTitle = `${dayName} • ${buildRes.genreTitle.split(" • ").pop() || "动画"}`;
            
            return buildRes;
        });

        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "Bangumi 加载失败" }]; }
}

// ==========================================
// 工具函数
// ==========================================

function cleanTitle(title) {
    if (!title) return "";
    // 去掉 "第x季", "Season x", "Part x"
    return title.replace(/第[一二三四五六七八九十\d]+[季章]/g, "")
                .replace(/Season \d+/i, "")
                .replace(/Part \d+/i, "")
                .trim();
}

async function searchTmdbInternal(query) {
    if (!query) return null;
    try {
        const res = await Widget.tmdb.get("/search/tv", { params: { query: query, language: "zh-CN", page: 1 } });
        return (res.results || [])[0];
    } catch (e) { return null; }
}

// Bilibili 和 MAL 的逻辑 (保持原样，省略以节省篇幅，请直接复用上一版)
// 确保 fetchBilibiliRankSafe 和 fetchMalData 都在
async function fetchBilibiliRankSafe(type, page) {
    // ... (复用上一版)
    // 记得在 searchTmdbInternal 时也使用 cleanTitle 增强匹配
    const url = `https://api.bilibili.com/pgc/web/rank/list?day=3&season_type=${type}`;
    try {
        const res = await Widget.http.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/" } });
        const data = res.data || {};
        const fullList = data.result?.list || data.data?.list || [];
        const start = (page - 1) * 20;
        const end = start + 20;
        if (start >= fullList.length) return [];
        
        return await Promise.all(fullList.slice(start, end).map(async (item, i) => {
            let finalItem = {
                id: `bili_${item.season_id}`, tmdbId: 0, type: "tv",
                title: item.title, year: "", poster: item.cover,
                rating: "0.0", genreText: "动画", subTitle: `${start+i+1}. ${item.new_ep?.index_show || "热播"}`, desc: item.desc
            };
            const tmdb = await searchTmdbInternal(cleanTitle(item.title));
            if (tmdb) mergeTmdb(finalItem, tmdb);
            return buildItem(finalItem);
        }));
    } catch (e) { return []; }
}

async function fetchMalData(filterType, page) {
    // ... (复用上一版)
    let url = `https://api.jikan.moe/v4/top/anime?page=${page}`;
    if (filterType !== "top") url += `&filter=${filterType}`;
    try {
        const res = await Widget.http.get(url);
        const list = (res.data || {}).data || [];
        if (list.length === 0) return [];
        return await Promise.all(list.map(async (item, i) => {
            let finalItem = {
                id: `mal_${item.mal_id}`, tmdbId: 0, type: "tv",
                title: item.title_english || item.title, year: item.year ? String(item.year) : "",
                poster: item.images?.jpg?.large_image_url, rating: item.score, genreText: "动画",
                subTitle: `MAL ★${item.score}`, desc: item.synopsis
            };
            const tmdb = await searchTmdbInternal(cleanTitle(item.title_english || item.title));
            if (tmdb) mergeTmdb(finalItem, tmdb);
            return buildItem(finalItem);
        }));
    } catch (e) { return []; }
}

function mergeTmdb(target, source) {
    target.id = String(source.id);
    target.tmdbId = source.id;
    target.type = "tmdb"; // 升级类型
    target.poster = source.poster_path; // 相对路径
    target.backdrop = source.backdrop_path;
    target.rating = source.vote_average ? source.vote_average.toFixed(1) : target.rating;
    target.year = (source.first_air_date || "").substring(0, 4);
    if (source.overview) target.desc = source.overview;
    target.genreText = getGenreText(source.genre_ids);
}

function getWeekdayName(id) {
    const map = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
    return map[id] || "";
}
