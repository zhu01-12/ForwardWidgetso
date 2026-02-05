WidgetMetadata = {
    id: "imdb_yunhe",
    title: "IMDb热度榜",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖", // 致敬原作者风格
    description: "包含IMDb全球趋势、高分经典及国产剧集热度监测。",
    version: "1.0.0",
    site: "https://www.themoviedb.org",
    globalParams: [], // 不使用全局参数，降低配置难度

    modules: [
        {
            title: "📈 影视热度排行榜",
            functionName: "loadTopLists",
            type: "list",
            cacheDuration: 3600, // 缓存1小时
            params: [
                {
                    name: "source",
                    title: "选择榜单",
                    type: "enumeration",
                    value: "global_trend",
                    enumOptions: [
                        { title: "🌍 全球 · 实时热播 (IMDb/Trending)", value: "global_trend" },
                        { title: "🌍 全球 · 口碑高分 (Top Rated)", value: "global_top" },
                        { title: "🌍 全球 · 流行趋势 (Popular)", value: "global_pop" },
                        { title: "🇨🇳 国产 · 剧集热度 (云合模拟)", value: "cn_drama" },
                        { title: "🇨🇳 国产 · 电影热度 (院线/网大)", value: "cn_movie" }
                    ]
                },
                {
                    name: "mediaType",
                    title: "筛选类型",
                    type: "enumeration",
                    value: "all",
                    // 仅在全球榜单下生效，国产榜单自动锁定类型
                    belongTo: { paramName: "source", value: ["global_trend", "global_pop", "global_top"] },
                    enumOptions: [
                        { title: "全部 (剧集+电影)", value: "all" },
                        { title: "仅看电影", value: "movie" },
                        { title: "仅看剧集", value: "tv" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// =========================================================================
// 1. 静态数据与工具 (直接复用成熟代码的 Map)
// =========================================================================

const GENRE_MAP = {
    28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
    9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚",
    10752: "战争", 37: "西部", 10759: "动作冒险", 10762: "儿童", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "综合";
    // 只取前两个标签，保持 UI 整洁
    return ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(" / ");
}

/**
 * 核心构建函数
 * 严格保证返回字段齐全，防止 "数据缺失" 报错
 */
function buildItem(item, forceType) {
    if (!item) return null;

    // 1. 容错处理：获取 ID
    const id = item.id;
    if (!id) return null;

    // 2. 识别类型 (Media Type)
    // TMDB 某些接口不返回 media_type，必须通过 forceType 强行补全
    let mType = item.media_type || forceType;
    if (!mType) {
        // 最后的猜想：有 title 是电影，有 name 是剧集
        mType = item.title ? "movie" : "tv";
    }

    // 3. 提取基础信息
    const title = item.title || item.name || "未知标题";
    const dateStr = item.release_date || item.first_air_date || "";
    const year = dateStr.substring(0, 4);
    const overview = item.overview || "暂无简介";
    
    // 4. 图片处理 (给个兜底，虽然 Forward 会处理空图，但最好给个 path)
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "";
    const backdrop = item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "";

    // 5. 评分与标签
    const score = item.vote_average ? item.vote_average.toFixed(1) : "0.0";
    const genreText = getGenreText(item.genre_ids);
    const typeLabel = mType === "movie" ? "电影" : "剧集";
    
    // 模仿 ultimate_media_hub 的副标题格式
    const genreTitle = [year, genreText].filter(Boolean).join(" • ");
    const subTitle = `⭐ ${score}  |  ${typeLabel}`;

    return {
        id: String(id),           // Forward 要求 String
        tmdbId: parseInt(id),     // Forward 要求 Int
        type: "tmdb",             // 必须固定为 tmdb
        mediaType: mType,         // movie 或 tv
        title: title,
        subTitle: subTitle,
        genreTitle: genreTitle,   // 关键 UI 字段
        description: overview,
        posterPath: poster,
        backdropPath: backdrop,
        rating: score,
        year: year
    };
}

// =========================================================================
// 2. 核心业务逻辑
// =========================================================================

async function loadTopLists(params) {
    const { source, mediaType = "all" } = params;
    const page = params.page || 1;

    let apiUrl = "";
    let queryParams = {
        language: "zh-CN",
        page: page,
        include_adult: false
    };

    // --- 场景 A: 实时热播 (Trending) ---
    // 这是唯一原生支持 "all" (混合) 的接口
    if (source === "global_trend") {
        const timeWindow = "week"; // 默认看周榜
        apiUrl = `/trending/${mediaType}/${timeWindow}`;
    }

    // --- 场景 B: 流行 & 高分 (Popular & Top Rated) ---
    else if (source === "global_pop" || source === "global_top") {
        const pathSuffix = source === "global_top" ? "top_rated" : "popular";
        
        // 如果用户选了 "全部"，因为没有 /all/popular 接口，
        // 为了稳定性，我们强制回退到 "movie" (或者这里可以做简单的并发，但为了防报错，建议分开)
        // 此处策略：如果是 all，默认只请求 movie，避免 Promise.all 的复杂性导致的数据缺失
        // 改进：做简单的并发
        if (mediaType === "all") {
             return await loadMixedList(pathSuffix, page);
        } else {
            apiUrl = `/${mediaType}/${pathSuffix}`;
        }
    }

    // --- 场景 C: 国产榜单 (云合模拟) ---
    else if (source.startsWith("cn_")) {
        const isTv = source === "cn_drama";
        const type = isTv ? "tv" : "movie";
        
        apiUrl = `/discover/${type}`;
        queryParams = {
            ...queryParams,
            sort_by: "popularity.desc",
            with_original_language: "zh", // 核心：只要国产原声
            "vote_count.gte": 2           // 稍微过滤掉零互动的垃圾数据
            // watch_region: "CN"         // 移除这个，因为很多国产剧在TMDB数据里没有标记CN地区，加上反而搜不到
        };
    }

    // --- 发送请求 ---
    try {
        const res = await Widget.tmdb.get(apiUrl, { params: queryParams });
        
        // 严谨校验
        if (!res || !res.results || !Array.isArray(res.results)) {
            return []; // 返回空数组，而不是 undefined
        }

        // 映射结果
        // 注意：Discover 接口不返回 media_type，需要根据 source 推断
        let forceType = null;
        if (source.includes("movie")) forceType = "movie";
        if (source.includes("drama") || source.includes("tv")) forceType = "tv";
        if (mediaType !== "all" && mediaType) forceType = mediaType;

        return res.results.map(item => buildItem(item, forceType)).filter(Boolean);

    } catch (e) {
        // 错误处理：返回一个提示 Item，避免静默失败
        return [{
            id: "err_01",
            type: "text",
            title: "加载失败",
            description: "网络请求异常，请检查连接。"
        }];
    }
}

// 辅助：处理混合榜单 (Pop/Top)
async function loadMixedList(suffix, page) {
    try {
        const [resM, resT] = await Promise.all([
            Widget.tmdb.get(`/movie/${suffix}`, { params: { language: "zh-CN", page: page } }),
            Widget.tmdb.get(`/tv/${suffix}`, { params: { language: "zh-CN", page: page } })
        ]);

        const movies = (resM.results || []).map(i => buildItem(i, "movie"));
        const tvs = (resT.results || []).map(i => buildItem(i, "tv"));

        // 合并并简单排序 (按评分或热度)
        const combined = [...movies, ...tvs].sort((a, b) => {
            // 如果是高分榜，按 rating 降序
            if (suffix === "top_rated") return parseFloat(b.rating) - parseFloat(a.rating);
            // 否则(popular)按 popularity (这里我们 buildItem 没存 pop，简单交替或直接返回即可)
            return 0; 
        });

        return combined.slice(0, 20); // 只要前20，保证分页正常
    } catch (e) {
        return [];
    }
}
