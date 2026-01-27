WidgetMetadata = {
    id: "trakt_random_pro",
    title: "Trakt 惊喜推荐",
    author: "MakkaPakka",
    description: "从你最近观看的剧集中随机抽取 5 部进行混合推荐，每 12 小时刷新一次。",
    version: "3.0.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取推荐数据。",
            value: ""
        },
        {
            name: "traktUser",
            title: "Trakt 用户名 (必填)",
            type: "input",
            description: "填入 Trakt 个人主页网址末尾的 ID (slug)",
            value: ""
        },
        {
            name: "clientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "建议填入以防限流。",
            value: ""
        }
    ],

    modules: [
        {
            title: "今日惊喜推荐",
            functionName: "loadRandomMix",
            type: "video", // 使用标准 video 类型
            cacheDuration: 43200, // 缓存 12 小时
            params: [] // 无需额外参数，全靠全局配置
        }
    ]
};

// 默认公共 ID
const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadRandomMix(params = {}) {
    const { apiKey, traktUser } = params;
    const clientId = params.clientId || DEFAULT_TRAKT_ID;

    if (!apiKey || !traktUser) {
        return [{
            id: "err_missing",
            type: "text",
            title: "参数缺失",
            subTitle: "请在设置中填写 TMDB Key 和 Trakt 用户名"
        }];
    }

    // 1. 获取去重后的观看历史池 (Max 100 条记录 -> 提取 unique shows)
    const uniqueShows = await fetchUniqueHistory(traktUser, clientId);

    if (uniqueShows.length === 0) {
        return [{
            id: "err_empty",
            type: "text",
            title: "暂无记录",
            subTitle: "Trakt 历史为空或账号私密"
        }];
    }

    // 2. 截取最近的 30 部作为候选池
    const candidatePool = uniqueShows.slice(0, 30);
    console.log(`[Mix] Pool: ${uniqueShows.length}, Candidates: ${candidatePool.length}`);

    // 3. 随机抽取 5 部种子
    const pickCount = Math.min(candidatePool.length, 5);
    const seeds = getRandomSeeds(candidatePool, pickCount);
    
    // 打印日志方便调试
    const seedTitles = seeds.map(s => s.title).join(", ");
    console.log(`[Mix] Seeds: ${seedTitles}`);

    // 4. 并发获取推荐
    const promiseList = seeds.map(seed => fetchTmdbRecs(seed, apiKey));
    const resultsArray = await Promise.all(promiseList);

    // 5. 混合洗牌算法 (Interleave)
    // 将 5 组推荐结果交叉合并: [A1, B1, C1, D1, E1, A2, B2...]
    const mixedList = [];
    let maxRecsLen = 0;
    
    // 找出最长的一组
    for (const list of resultsArray) {
        if (list.length > maxRecsLen) maxRecsLen = list.length;
    }

    // 交叉循环
    const seenIds = new Set();
    for (let i = 0; i < maxRecsLen; i++) {
        for (const list of resultsArray) {
            if (i < list.length) {
                const item = list[i];
                // 严格去重
                if (!seenIds.has(item.tmdbId)) {
                    seenIds.add(item.tmdbId);
                    mixedList.push(item);
                }
            }
        }
    }

    // 限制最终展示数量 (20 个)
    const finalItems = mixedList.slice(0, 20);

    if (finalItems.length === 0) {
        return [{
            id: "err_tmdb",
            type: "text",
            title: "无推荐结果",
            subTitle: "TMDB 暂无相关推荐数据"
        }];
    }

    return finalItems;
}

// ==========================================
// 辅助逻辑
// ==========================================

async function fetchUniqueHistory(username, clientId) {
    // limit=100 获取足够的样本以供去重
    const url = `https://api.trakt.tv/users/${username}/history/shows?limit=100`;
    
    try {
        const res = await Widget.http.get(url, {
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": clientId
            },
            timeout: 5000
        });
        
        const data = res.data || [];
        if (!Array.isArray(data)) return [];

        const uniqueMap = new Map();
        for (const item of data) {
            const show = item.show;
            if (show && show.ids && show.ids.tmdb) {
                if (!uniqueMap.has(show.ids.tmdb)) {
                    uniqueMap.set(show.ids.tmdb, {
                        tmdbId: show.ids.tmdb,
                        title: show.title
                    });
                }
            }
        }
        return Array.from(uniqueMap.values());
    } catch (e) {
        console.error("History Error:", e);
        return [];
    }
}

function getRandomSeeds(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

async function fetchTmdbRecs(seedItem, apiKey) {
    const url = `https://api.themoviedb.org/3/tv/${seedItem.tmdbId}/recommendations?api_key=${apiKey}&language=zh-CN&page=1`;
    
    try {
        const res = await Widget.http.get(url);
        const data = res.data || {};
        
        if (!data.results) return [];

        // 每部种子只取前 5 个高分推荐
        return data.results.slice(0, 5).map(item => ({
            id: String(item.id),
            tmdbId: parseInt(item.id),
            type: "tmdb",
            mediaType: "tv",
            
            title: item.name || item.title,
            
            // 核心修改：将来源放在 subTitle，更显眼
            subTitle: `✨ 源于: ${seedItem.title}`,
            description: item.overview || `原名: ${item.original_name}`,
            
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            
            rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
            year: (item.first_air_date || "").substring(0, 4)
        }));
    } catch (e) { return []; }
}
