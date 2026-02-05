WidgetMetadata = {
    id: "imdb_chart_fix_import",
    title: "IMDb全球热榜",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
    description: "IMDb/TMDB 电影与剧集热度榜单。",
    version: "1.0.1",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",
    globalParams: [],
    modules: [
        {
            title: "🔥 热门榜单",
            functionName: "loadImdbList",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "category",
                    title: "类型",
                    type: "enumeration",
                    value: "trending",
                    enumOptions: [
                        { title: "🔥 实时热度 (Trending)", value: "trending" },
                        { title: "💎 高分榜单 (Top Rated)", value: "top_rated" },
                        { title: "🌊 流行榜单 (Popular)", value: "popular" }
                    ]
                },
                {
                    name: "mediaType",
                    title: "范围",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "全部 (剧集+电影)", value: "all" },
                        { title: "电影", value: "movie" },
                        { title: "剧集", value: "tv" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// ================= 逻辑部分 =================

const GENRE_MAP = {
    28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
    9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视电影", 53: "惊悚",
    10752: "战争", 37: "西部", 10759: "动作冒险", 10762: "儿童", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "";
    return ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 3).join(" / ");
}

function buildItem(item, forceType) {
    if (!item) return null;
    // 强制修正类型，防止 App 无法识别
    const type = forceType || item.media_type || (item.title ? "movie" : "tv");
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || "").substring(0, 4);
    const score = item.vote_average ? item.vote_average.toFixed(1) : "0.0";
    const genre = getGenreText(item.genre_ids);

    return {
        id: String(item.id),
        tmdbId: parseInt(item.id),
        type: "tmdb",
        mediaType: type,
        title: title,
        subTitle: `⭐ ${score} | ${year}`,
        posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
        backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
        description: item.overview,
        rating: score,
        year: year,
        genreTitle: [year, genre].filter(Boolean).join(" • ")
    };
}

async function loadImdbList(params) {
    const category = params.category || "trending";
    const mediaType = params.mediaType || "all";
    const page = params.page || 1;

    try {
        let items = [];
        
        // 1. Trending 接口 (原生支持 all)
        if (category === "trending") {
            const res = await Widget.tmdb.get(`/trending/${mediaType}/week`, { 
                params: { language: "zh-CN", page: page } 
            });
            items = (res.results || []).map(i => buildItem(i));
        } 
        // 2. Popular / Top Rated (需要手动混合)
        else {
            if (mediaType === "all") {
                const [resM, resT] = await Promise.all([
                    Widget.tmdb.get(`/movie/${category}`, { params: { language: "zh-CN", page: page } }),
                    Widget.tmdb.get(`/tv/${category}`, { params: { language: "zh-CN", page: page } })
                ]);
                const movies = (resM.results || []).map(i => buildItem(i, "movie"));
                const tvs = (resT.results || []).map(i => buildItem(i, "tv"));
                items = [...movies, ...tvs].sort((a, b) => b.rating - a.rating).slice(0, 20);
            } else {
                const res = await Widget.tmdb.get(`/${mediaType}/${category}`, { 
                    params: { language: "zh-CN", page: page } 
                });
                items = (res.results || []).map(i => buildItem(i, mediaType));
            }
        }

        return items;

    } catch (e) {
        // 如果出错，返回一个提示，而不是让 App 崩溃
        return [{
            id: "error",
            type: "text",
            title: "加载失败",
            description: "请下拉刷新重试"
        }];
    }
}
