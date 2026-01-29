WidgetMetadata = {
    id: "what_to_watch_hub",
    title: "剧荒拯救者",
    author: "MakkaPakka",
    description: "不知道看什么？随机抽一部，或者根据喜好推荐相似作品。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    // 0. 全局免 Key
    globalParams: [],

    modules: [
        {
            title: "今天看什么",
            functionName: "loadRecommendations",
            type: "video",
            cacheDuration: 0, // 不缓存，每次点都不一样
            params: [
                {
                    name: "mode",
                    title: "推荐模式",
                    type: "enumeration",
                    value: "random",
                    enumOptions: [
                        { title: "🎲 随便看看 (随机高分)", value: "random" },
                        { title: "🎬 找相似 (输入片名)", value: "similar" }
                    ]
                },
                {
                    name: "mediaType",
                    title: "类型",
                    type: "enumeration",
                    value: "tv",
                    enumOptions: [
                        { title: "剧集", value: "tv" },
                        { title: "电影", value: "movie" }
                    ]
                },
                // 仅在 "找相似" 模式下有效
                {
                    name: "keyword",
                    title: "输入片名 (仅找相似)",
                    type: "input",
                    description: "例如：绝命毒师",
                    belongTo: { paramName: "mode", value: ["similar"] }
                }
            ]
        }
    ]
};

// ==========================================
// 核心逻辑
// ==========================================

async function loadRecommendations(params = {}) {
    const { mode = "random", mediaType = "tv", keyword } = params;

    // A. 随机模式
    if (mode === "random") {
        return await fetchRandomContent(mediaType);
    }

    // B. 相似模式
    if (mode === "similar") {
        if (!keyword) return [{ id: "info", type: "text", title: "请输入片名" }];
        
        // 1. 先搜索该片 ID
        const seedItem = await searchTmdb(keyword, mediaType);
        if (!seedItem) return [{ id: "err", type: "text", title: "未找到该片", subTitle: "请尝试更换关键词" }];

        // 2. 获取推荐
        return await fetchSimilarContent(seedItem.id, mediaType, seedItem.name || seedItem.title);
    }
}

// ==========================================
// 1. 随机高分 (Random)
// ==========================================
async function fetchRandomContent(mediaType) {
    // 随机策略：
    // 1. 随机页码 (1-50)
    // 2. 筛选高分 (vote_average >= 7.0)
    // 3. 筛选热门 (vote_count >= 100)
    // 4. 结果洗牌
    
    const randomPage = Math.floor(Math.random() * 50) + 1;
    
    const queryParams = {
        language: "zh-CN",
        sort_by: "popularity.desc",
        include_adult: false,
        "vote_average.gte": 7.0,
        "vote_count.gte": 100,
        page: randomPage
    };

    try {
        const res = await Widget.tmdb.get(`/discover/${mediaType}`, { params: queryParams });
        let items = res.results || [];
        
        if (items.length === 0) return [{ id: "empty", type: "text", title: "运气不好，没抽到" }];

        // 洗牌算法 (Fisher-Yates)
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }

        // 取前 10 个
        return items.slice(0, 10).map(item => buildItem(item, mediaType, "🎲 随机推荐"));

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败" }];
    }
}

// ==========================================
// 2. 相似推荐 (Similar)
// ==========================================
async function fetchSimilarContent(id, mediaType, seedName) {
    try {
        // 使用 recommendations 接口 (比 similar 更智能)
        const res = await Widget.tmdb.get(`/${mediaType}/${id}/recommendations`, {
            params: { language: "zh-CN", page: 1 }
        });
        const items = res.results || [];

        if (items.length === 0) return [{ id: "empty", type: "text", title: "暂无推荐", subTitle: "TMDB 没有相关数据" }];

        return items.slice(0, 15).map(item => buildItem(item, mediaType, `✨ 因为: ${seedName}`));

    } catch (e) {
        return [{ id: "err", type: "text", title: "推荐失败" }];
    }
}

// ==========================================
// 辅助工具
// ==========================================

async function searchTmdb(query, type) {
    try {
        const res = await Widget.tmdb.get(`/search/${type}`, {
            params: { query: encodeURIComponent(query), language: "zh-CN", page: 1 }
        });
        return (res.results || [])[0];
    } catch (e) { return null; }
}

function buildItem(item, mediaType, subTitle) {
    const year = (item.first_air_date || item.release_date || "").substring(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : "0.0";
    
    return {
        id: String(item.id),
        tmdbId: item.id,
        type: "tmdb",
        mediaType: mediaType,
        
        title: item.name || item.title,
        subTitle: subTitle,
        description: item.overview || "暂无简介",
        
        posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
        backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
        
        rating: rating,
        year: year
    };
}
