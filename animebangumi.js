WidgetMetadata = {
    id: "anime_multiverse_ultimate",
    title: "二次元多维宇宙 (CN)",
    author: "Makkapakka",
    description: "聚合 Bangumi、Bilibili、AniList 与 MAL 权威榜单，全中文优化版。",
    version: "2.1.0",
    requiredVersion: "0.0.1",
    site: "https://bgm.tv",

    modules: [
        // ===========================================
        // 模块 1: Bangumi 放送表 (日历)
        // ===========================================
        {
            title: "Bangumi 放送表",
            functionName: "loadBangumiCalendar",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "weekday",
                    title: "选择日期",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "📅 今日更新", value: "today" },
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
        },

        // ===========================================
        // 模块 2: Bilibili 新番表 (播放源)
        // ===========================================
        {
            title: "Bilibili 新番表",
            functionName: "loadBilibiliCalendar",
            type: "list",
            cacheDuration: 1800,
            params: [
                {
                    name: "weekday",
                    title: "选择日期",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "📅 今日更新", value: "today" },
                        { title: "周一", value: "1" },
                        { title: "周二", value: "2" },
                        { title: "周三", value: "3" },
                        { title: "周四", value: "4" },
                        { title: "周五", value: "5" },
                        { title: "周六", value: "6" },
                        { title: "周日", value: "0" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },

        // ===========================================
        // 模块 3: AniList 全球日程 (国际化)
        // ===========================================
        {
            title: "AniList 全球日程",
            functionName: "loadAniListCalendar",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "weekday",
                    title: "选择日期",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "📅 今日更新", value: "today" },
                        { title: "Next 24h", value: "next" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },

        // ===========================================
        // 模块 4: MyAnimeList 权威榜单
        // ===========================================
        {
            title: "MAL 权威榜单",
            functionName: "loadMalRanking",
            type: "list",
            cacheDuration: 7200, 
            params: [
                {
                    name: "filter",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "airing",
                    enumOptions: [
                        { title: "🔥 当前热播 Top", value: "airing" },
                        { title: "🏆 历史总榜 Top", value: "all" },
                        { title: "👥 人气最高 (Members)", value: "bypopularity" },
                        { title: "🎥 最佳剧场版", value: "movie" },
                        { title: "🔜 最受期待 (Upcoming)", value: "upcoming" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// =========================================================================
// 0. 通用工具与字典
// =========================================================================

const GENRE_MAP = {
    16: "动画", 10759: "动作冒险", 35: "喜剧", 18: "剧情", 14: "奇幻", 
    878: "科幻", 9648: "悬疑", 10749: "爱情", 27: "恐怖", 10765: "科幻奇幻"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "Anime";
    const genres = ids.filter(id => id !== 16).map(id => GENRE_MAP[id]).filter(Boolean);
    return genres.length > 0 ? genres.slice(0, 2).join(" / ") : "动画";
}

function getWeekdayName(id) {
    const map = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日", 0: "周日" };
    return map[id] || "";
}

// 统一 Item 构建器
function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    const fullPoster = poster && poster.startsWith("http") ? poster : (poster ? `https://image.tmdb.org/t/p/w500${poster}` : "");
    const fullBackdrop = backdrop && backdrop.startsWith("http") ? backdrop : (backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "");

    return {
        id: String(id),
        tmdbId: parseInt(tmdbId) || 0,
        type: "tmdb",
        mediaType: type || "tv",
        title: title, // 这里传入的 title 必须已经是处理过的最终标题
        genreTitle: [year, genreText].filter(Boolean).join(" • "),
        subTitle: subTitle,
        posterPath: fullPoster,
        backdropPath: fullBackdrop,
        description: desc || "暂无简介",
        rating: rating ? Number(rating).toFixed(1) : "0.0",
        year: year
    };
}

// =========================================================================
// 1. 业务逻辑：Bangumi (默认中文)
// =========================================================================

async function loadBangumiCalendar(params = {}) {
    const { weekday = "today", page = 1 } = params;
    const pageSize = 15;

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
        if (!dayData || !dayData.items) return [];

        const allItems = dayData.items;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        if (start >= allItems.length) return [];
        
        const pageItems = allItems.slice(start, end);

        const promises = pageItems.map(async (item) => {
            // Bangumi 本身就有中文名 (name_cn)，若无则用原名 (name)
            const cnTitle = item.name_cn || item.name;
            const fallbackCover = item.images ? (item.images.large || item.images.common) : "";
            
            // TMDB 匹配
            const tmdbItem = await searchTmdbBestMatch(cnTitle, item.name);

            if (tmdbItem) {
                return buildItem({
                    id: tmdbItem.id,
                    tmdbId: tmdbItem.id,
                    type: "tv",
                    title: tmdbItem.name || tmdbItem.title, // 强制使用 TMDB 的中文标题
                    year: (tmdbItem.first_air_date || "").substring(0, 4),
                    poster: tmdbItem.poster_path,
                    backdrop: tmdbItem.backdrop_path,
                    rating: item.rating?.score || tmdbItem.vote_average,
                    genreText: getGenreText(tmdbItem.genre_ids),
                    subTitle: `${dayName} • ${item.air_date || "更新"}`,
                    desc: tmdbItem.overview || item.summary
                });
            } else {
                return buildItem({
                    id: `bgm_${item.id}`,
                    tmdbId: 0,
                    type: "url",
                    title: cnTitle, // 没匹配到 TMDB，使用 Bangumi 的 name_cn
                    year: "",
                    poster: fallbackCover,
                    backdrop: "",
                    rating: item.rating?.score,
                    genreText: "Bangumi",
                    subTitle: `${dayName} • 暂无详细数据`,
                    desc: item.summary
                });
            }
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "Bangumi 连接失败" }]; }
}

// =========================================================================
// 2. 业务逻辑：Bilibili (默认中文)
// =========================================================================

async function loadBilibiliCalendar(params = {}) {
    // ... B站逻辑本身就是中文，只需确保 TMDB 匹配时也用中文覆盖 ...
    const { weekday = "today", page = 1 } = params;
    const pageSize = 15;

    let targetBiliDay = 0; 
    const today = new Date();
    if (weekday === "today") {
        const jsDay = today.getDay();
        targetBiliDay = jsDay === 0 ? 7 : jsDay;
    } else {
        targetBiliDay = parseInt(weekday);
        if (targetBiliDay === 0) targetBiliDay = 7;
    }
    const dayName = getWeekdayName(targetBiliDay);

    try {
        const res = await Widget.http.get("https://api.bilibili.com/pgc/web/timeline/v2?season_type=1&before=6&after=6");
        const data = res.data?.result?.timeline || [];
        const targetTimeline = data.find(t => t.day_of_week === targetBiliDay);
        if (!targetTimeline || !targetTimeline.episodes) return [];

        const allEpisodes = targetTimeline.episodes;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        if (start >= allEpisodes.length) return [];
        const pageItems = allEpisodes.slice(start, end);

        const promises = pageItems.map(async (ep) => {
            const title = ep.season_title || ep.title; // B站标题(中文)
            const updateIndex = ep.pub_index;
            const updateTime = ep.pub_time;
            const cover = ep.cover;
            
            const tmdbItem = await searchTmdbBestMatch(title);

            if (tmdbItem) {
                return buildItem({
                    id: tmdbItem.id,
                    tmdbId: tmdbItem.id,
                    type: "tv",
                    title: tmdbItem.name || tmdbItem.title, // 强制 TMDB 中文
                    year: (tmdbItem.first_air_date || "").substring(0, 4),
                    poster: tmdbItem.poster_path,
                    backdrop: tmdbItem.backdrop_path,
                    rating: tmdbItem.vote_average,
                    genreText: getGenreText(tmdbItem.genre_ids),
                    subTitle: `${dayName} ${updateTime} • ${updateIndex}`,
                    desc: tmdbItem.overview
                });
            } else {
                return buildItem({
                    id: `bili_${ep.season_id}`,
                    tmdbId: 0,
                    type: "url",
                    title: title, // B站原生中文
                    year: "2024",
                    poster: cover,
                    backdrop: cover,
                    rating: "0.0",
                    genreText: "Bilibili",
                    subTitle: `${dayName} ${updateTime} • ${updateIndex}`,
                    desc: "暂无 TMDB 详情"
                });
            }
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "Bilibili 连接失败" }]; }
}

// =========================================================================
// 3. 业务逻辑：AniList (优先中文 > 原文 > 英文)
// =========================================================================

async function loadAniListCalendar(params = {}) {
    const { weekday = "today", page = 1 } = params;
    const perPage = 15;
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + 86400;

    const query = `
    query ($page: Int, $perPage: Int, $start: Int, $end: Int) {
      Page (page: $page, perPage: $perPage) {
        airingSchedules (airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          airingAt
          episode
          media {
            title { native romaji english }
            coverImage { large }
            averageScore
            description
          }
        }
      }
    }
    `;

    try {
        const res = await Widget.http.post("https://graphql.anilist.co", {
            query: query,
            variables: { page, perPage, start: startTime, end: endTime }
        }, { headers: { "Content-Type": "application/json" } });

        const data = res.data?.data?.Page?.airingSchedules || [];
        if (data.length === 0) return [];

        const promises = data.map(async (item) => {
            const media = item.media;
            // 搜索策略：优先用 Native (原文) 去搜 TMDB，准确率最高
            // 备选显示标题：Native (原文) > Romaji > English
            const searchQ = media.title.native || media.title.romaji;
            const backupTitle = media.title.native || media.title.romaji || media.title.english;
            
            const episode = item.episode;
            const airDate = new Date(item.airingAt * 1000);
            const timeStr = `${airDate.getHours().toString().padStart(2,'0')}:${airDate.getMinutes().toString().padStart(2,'0')}`;
            
            const tmdbItem = await searchTmdbBestMatch(searchQ, media.title.english);

            if (tmdbItem) {
                return buildItem({
                    id: tmdbItem.id,
                    tmdbId: tmdbItem.id,
                    type: "tv",
                    title: tmdbItem.name || tmdbItem.title, // 核心：TMDB 中文标题
                    year: (tmdbItem.first_air_date || "").substring(0, 4),
                    poster: tmdbItem.poster_path,
                    backdrop: tmdbItem.backdrop_path,
                    rating: (media.averageScore / 10).toFixed(1),
                    genreText: getGenreText(tmdbItem.genre_ids),
                    subTitle: `Ep ${episode} • ${timeStr} 更新`,
                    desc: tmdbItem.overview
                });
            } else {
                return buildItem({
                    id: `al_${startTime}_${episode}`,
                    tmdbId: 0,
                    type: "url",
                    title: backupTitle, // 降级：使用 原文 > 英文
                    year: "",
                    poster: media.coverImage.large,
                    backdrop: "",
                    rating: (media.averageScore / 10).toFixed(1),
                    genreText: "AniList",
                    subTitle: `Ep ${episode} • ${timeStr} 更新`,
                    desc: media.description
                });
            }
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "AniList 连接失败" }]; }
}

// =========================================================================
// 4. 业务逻辑：MyAnimeList (优先中文 > 原文 > 英文)
// =========================================================================

async function loadMalRanking(params = {}) {
    const { filter = "airing", page = 1 } = params;
    const baseUrl = "https://api.jikan.moe/v4/top/anime";
    let apiParams = { page: page };
    
    if (filter === "airing") apiParams.filter = "airing";
    else if (filter === "bypopularity") apiParams.filter = "bypopularity";
    else if (filter === "upcoming") apiParams.filter = "upcoming";
    else if (filter === "movie") apiParams.type = "movie";

    try {
        const res = await Widget.http.get(baseUrl, { params: apiParams });
        if (res.statusCode === 429) return [{ id: "err", type: "text", title: "请求过快，请稍后再试 (MAL)" }];
        const data = res.data?.data || [];

        const promises = data.map(async (item, index) => {
            // 搜索策略：title_japanese (原文) > title (默认)
            const searchQ = item.title_japanese || item.title; 
            // 备选显示标题：Original > Default (Romaji/English) > English
            const backupTitle = item.title_japanese || item.title || item.title_english;
            
            const rank = item.rank ? `#${item.rank} ` : "";
            const score = item.score || 0;
            const episodes = item.episodes ? `${item.episodes}话` : "连载中";
            
            const tmdbItem = await searchTmdbBestMatch(searchQ, item.title_english);

            if (tmdbItem) {
                return buildItem({
                    id: tmdbItem.id,
                    tmdbId: tmdbItem.id,
                    type: item.type === "Movie" ? "movie" : "tv",
                    title: tmdbItem.name || tmdbItem.title, // 核心：TMDB 中文标题
                    year: String(item.year || (tmdbItem.first_air_date || "").substring(0, 4)),
                    poster: tmdbItem.poster_path,
                    backdrop: tmdbItem.backdrop_path,
                    rating: score,
                    genreText: getGenreText(tmdbItem.genre_ids),
                    subTitle: `${rank}• ${episodes} • ${item.status}`,
                    desc: tmdbItem.overview || item.synopsis
                });
            } else {
                return buildItem({
                    id: `mal_${item.mal_id}`,
                    tmdbId: 0,
                    type: "url",
                    title: backupTitle, // 降级：使用 原文 > 英文
                    year: String(item.year || ""),
                    poster: item.images?.jpg?.large_image_url,
                    backdrop: "",
                    rating: score,
                    genreText: "MAL",
                    subTitle: `${rank}• ${episodes} • ${item.status}`,
                    desc: item.synopsis
                });
            }
        });
        return await Promise.all(promises);
    } catch (e) { return [{ id: "err", type: "text", title: "MAL 连接失败" }]; }
}

// =========================================================================
// 5. 核心：TMDB 智能匹配 (强制中文)
// =========================================================================

async function searchTmdbBestMatch(query1, query2) {
    let res = await searchTmdb(query1);
    if (!res && query2) res = await searchTmdb(query2);
    return res;
}

async function searchTmdb(query) {
    if (!query) return null;
    const cleanQuery = query
        .replace(/第[一二三四五六七八九十\d]+[季章]/g, "")
        .replace(/Season \d+/i, "")
        .trim();

    try {
        const res = await Widget.tmdb.get("/search/multi", { 
            params: { 
                query: cleanQuery, 
                language: "zh-CN", // 关键：请求中文数据
                page: 1 
            } 
        });
        const results = res.results || [];
        const candidates = results.filter(r => r.media_type === "tv" || r.media_type === "movie");
        // 优先返回有中文简介的，或者至少有海报的
        // TMDB 有时虽然请求了 zh-CN，但如果没翻译，name 字段可能是原文
        // 这里我们信任 TMDB 的 language 参数 fallback 机制
        return candidates.find(r => r.poster_path) || candidates[0];
    } catch (e) { return null; }
}
