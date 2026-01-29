WidgetMetadata = {
    id: "trakt_variety_core",
    title: "Trakt 综艺核心 (追新版)",
    author: "Makkapakka",
    description: "利用 Trakt 精准时间轴与 TMDB 高清元数据，打造最强综艺追更表。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    // 1. 全局参数：必须填写 Client ID
    globalParams: [
        {
            name: "traktClientId",
            title: "Trakt Client ID (必填)",
            type: "input",
            description: "请前往 trakt.tv/oauth/applications 申请并填入",
            value: "" 
        }
    ],

    modules: [
        // ===========================================
        // 模块 1: 追新榜 (Calendar)
        // ===========================================
        {
            title: "📅 综艺追新榜",
            functionName: "loadTraktCalendar",
            type: "list",
            cacheDuration: 900, // 15分钟刷新一次，保证时间准确
            params: [
                {
                    name: "region",
                    title: "地区筛选",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "🌏 全球聚合", value: "all" },
                        { title: "🇨🇳 国内综艺 (含港台)", value: "cn" },
                        { title: "🇺🇸 欧美/日韩", value: "global" }
                    ]
                },
                {
                    name: "days",
                    title: "时间范围",
                    type: "enumeration",
                    value: "7",
                    enumOptions: [
                        { title: "未来 7 天", value: "7" },
                        { title: "未来 14 天", value: "14" },
                        { title: "未来 30 天", value: "30" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },

        // ===========================================
        // 模块 2: 热度榜 (Trending)
        // ===========================================
        {
            title: "🔥 综艺热度榜",
            functionName: "loadTraktTrending",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "region",
                    title: "地区筛选",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "🌏 全球聚合", value: "all" },
                        { title: "🇨🇳 国内综艺", value: "cn" },
                        { title: "🇺🇸 欧美/日韩", value: "global" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// =========================================================================
// 0. 核心工具
// =========================================================================

const GENRE_MAP = {
    10764: "真人秀", 10767: "脱口秀", 10763: "新闻", 10766: "肥皂剧", 
    35: "喜剧", 10751: "家庭", 10762: "儿童", 18: "剧情"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "综艺";
    const genres = ids.map(id => GENRE_MAP[id]).filter(Boolean);
    return genres.length > 0 ? genres.slice(0, 2).join(" / ") : "综艺";
}

function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    return {
        id: String(id),
        tmdbId: parseInt(tmdbId),
        type: "tmdb",
        mediaType: type || "tv",
        title: title,
        genreTitle: [year, genreText].filter(Boolean).join(" • "),
        subTitle: subTitle,
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : "",
        backdropPath: backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        description: desc || "暂无简介",
        rating: rating ? Number(rating).toFixed(1) : "0.0",
        year: year
    };
}

// 格式化 Trakt UTC 时间为本地显示格式 (MM-DD HH:mm)
function formatTraktDate(isoDateString) {
    if (!isoDateString) return "";
    const date = new Date(isoDateString);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${m}-${d} ${h}:${min}`;
}

// =========================================================================
// 1. Trakt 追新榜 (Calendar API)
// =========================================================================

async function loadTraktCalendar(params = {}) {
    const { region = "all", days = "7", page = 1, traktClientId } = params;

    if (!traktClientId) {
        return [{ id: "err", type: "text", title: "未填写 Trakt Client ID", subTitle: "请在插件设置中填写" }];
    }

    // 1. 构造 Trakt API URL
    const startDate = new Date().toISOString().split('T')[0]; // 今天
    // Trakt 综艺分类 slug
    const genres = "reality,game-show,talk-show,news"; 
    
    let url = `https://api.trakt.tv/calendars/all/shows/${startDate}/${days}?genres=${genres}`;
    
    // 地区筛选
    if (region === "cn") {
        url += "&countries=cn,hk,tw";
    } else if (region === "global") {
        url += "&countries=us,kr,jp,gb"; 
    }

    try {
        const res = await Widget.http.get(url, {
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": traktClientId
            }
        });

        const data = res.data || [];
        if (data.length === 0) return [];

        // 2. 本地分页 (Trakt Calendar 返回的是全量数据，需要手动切片)
        // 这样可以避免一次加载过多 TMDB 请求
        const pageSize = 20;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        
        // 如果分页超出范围
        if (start >= data.length) return [];
        
        const pageItems = data.slice(start, end);

        // 3. 并发请求 TMDB 获取中文元数据
        const promises = pageItems.map(async (item) => {
            const show = item.show;
            const episode = item.episode;
            const tmdbId = show.ids.tmdb;

            // ❌ 严选模式：没有 TMDB ID 直接跳过
            if (!tmdbId) return null;

            // 请求 TMDB 详情 (强制中文)
            const tmdbItem = await fetchTmdbDetail(tmdbId);
            
            // ❌ 严选模式：TMDB 请求失败或无数据也跳过
            if (!tmdbItem) return null;

            // ✅ 构造数据
            // 副标题：时间 + 季/集
            const timeStr = formatTraktDate(item.first_aired);
            const epStr = `S${episode.season}E${episode.number}`;
            const genre = getGenreText(tmdbItem.genres ? tmdbItem.genres.map(g => g.id) : []);

            return buildItem({
                id: tmdbId,
                tmdbId: tmdbId,
                type: "tv",
                title: tmdbItem.name || show.title, // 优先 TMDB 中文名
                year: (tmdbItem.first_air_date || "").substring(0, 4),
                poster: tmdbItem.poster_path,
                backdrop: tmdbItem.backdrop_path,
                rating: tmdbItem.vote_average,
                genreText: genre,
                // 你的要求：更新时间和类型
                subTitle: `${timeStr} • ${epStr}`,
                desc: `最新更新: ${episode.title || ("第" + episode.number + "集")}\n${tmdbItem.overview}`
            });
        });

        const results = await Promise.all(promises);
        return results.filter(Boolean);

    } catch (e) {
        return [{ id: "err", type: "text", title: "Trakt 请求失败", subTitle: e.message }];
    }
}

// =========================================================================
// 2. Trakt 热度榜 (Trending API)
// =========================================================================

async function loadTraktTrending(params = {}) {
    const { region = "all", page = 1, traktClientId } = params;

    if (!traktClientId) return [{ id: "err", type: "text", title: "请填写 Trakt Client ID" }];

    // Trakt Trending 支持分页
    const limit = 20;
    const genres = "reality,game-show,talk-show";
    let url = `https://api.trakt.tv/shows/trending?page=${page}&limit=${limit}&genres=${genres}`;

    if (region === "cn") url += "&countries=cn,hk,tw";
    else if (region === "global") url += "&countries=us,kr,jp,gb";

    try {
        const res = await Widget.http.get(url, {
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": traktClientId
            }
        });

        const data = res.data || [];
        
        const promises = data.map(async (item) => {
            // item 结构: { watchers: 123, show: { ... } }
            const show = item.show;
            const tmdbId = show.ids.tmdb;

            if (!tmdbId) return null;

            const tmdbItem = await fetchTmdbDetail(tmdbId);
            if (!tmdbItem) return null;

            const genre = getGenreText(tmdbItem.genres ? tmdbItem.genres.map(g => g.id) : []);

            return buildItem({
                id: tmdbId,
                tmdbId: tmdbId,
                type: "tv",
                title: tmdbItem.name || show.title,
                year: (tmdbItem.first_air_date || "").substring(0, 4),
                poster: tmdbItem.poster_path,
                backdrop: tmdbItem.backdrop_path,
                rating: tmdbItem.vote_average,
                genreText: genre,
                subTitle: `🔥 ${item.watchers} 人正在看 • ${genre}`,
                desc: tmdbItem.overview
            });
        });

        const results = await Promise.all(promises);
        return results.filter(Boolean);

    } catch (e) { return [{ id: "err", type: "text", title: "加载失败" }]; }
}

// =========================================================================
// 3. 辅助函数
// =========================================================================

// 单独封装 TMDB 详情请求
async function fetchTmdbDetail(tmdbId) {
    try {
        const res = await Widget.tmdb.get(`/tv/${tmdbId}`, {
            params: { language: "zh-CN" }
        });
        return res;
    } catch (e) {
        return null;
    }
}
