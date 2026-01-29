WidgetMetadata = {
    id: "anime_core_universe",
    title: "二次元补完计划",
    author: "Makkapakka",
    description: "聚合动漫热度榜单与每周更新时刻表，专为二次元打造。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    // 0. 全局参数 (无需 Key，利用 Forward 内置 TMDB)
    globalParams: [],

    modules: [
        // ===========================================
        // 模块 1: 热门番剧榜 (Ranking)
        // ===========================================
        {
            title: "热门番剧榜 (Ranking)",
            functionName: "loadAnimeRanking",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "sortType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "airing_now",
                    enumOptions: [
                        { title: "🔥 当季热播 (正在连载)", value: "airing_now" },
                        { title: "👑 影史高分 (神作推荐)", value: "top_rated" },
                        { title: "📅 即将上映 (新番预告)", value: "upcoming" },
                        { title: "📺 热门剧场版/电影", value: "movie_popular" }
                    ]
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                }
            ]
        },

        // ===========================================
        // 模块 2: 追番周见表 (Weekly Schedule)
        // ===========================================
        {
            title: "追番周见表 (Schedule)",
            functionName: "loadAnimeWeekly",
            type: "list",
            cacheDuration: 1800, // 半小时刷新一次
            params: [
                {
                    name: "weekday",
                    title: "选择放送日",
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
                        { title: "周日 (日)", value: "0" }
                    ]
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                }
            ]
        }
    ]
};

// =========================================================================
// 0. 通用工具与字典
// =========================================================================

const GENRE_MAP = {
    10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 10762: "儿童", 9648: "悬疑", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀",
    10768: "战争政治", 37: "西部", 28: "动作", 12: "冒险", 14: "奇幻",
    878: "科幻", 53: "惊悚", 10749: "爱情", 27: "恐怖"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "动画";
    // 过滤掉 "动画" (16) 本身，因为我们知道这是动漫 Widget，显示其他类型更有意义
    const genres = ids.filter(id => id !== 16).map(id => GENRE_MAP[id]).filter(Boolean);
    return genres.length > 0 ? genres.slice(0, 2).join(" / ") : "动画";
}

/**
 * 统一构建 Item 对象
 * 遵循你的习惯：genreTitle 包含年份和类型，subTitle 灵活定制
 */
function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    return {
        id: String(id),
        tmdbId: parseInt(tmdbId),
        type: "tmdb",
        mediaType: type, // tv 或 movie
        title: title,
        // 核心习惯：标题下方显示 [年份 • 类型]
        genreTitle: [year, genreText].filter(Boolean).join(" • "), 
        subTitle: subTitle,
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : "",
        backdropPath: backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        description: desc || "暂无简介",
        rating: rating ? Number(rating).toFixed(1) : "0.0",
        year: year
    };
}

// =========================================================================
// 1. 业务逻辑：热门番剧榜
// =========================================================================

async function loadAnimeRanking(params = {}) {
    const { sortType = "airing_now", page = 1 } = params;
    
    // 基础参数：日漫 (ja) + 动画 (16)
    // 这样可以过滤掉欧美卡通，只看日漫
    let queryParams = {
        language: "zh-CN",
        page: page,
        with_genres: "16", 
        with_original_language: "ja", 
        include_adult: false,
        include_null_first_air_dates: false
    };

    let endpoint = "/discover/tv";
    let mediaType = "tv";

    // 根据类型调整参数
    const today = new Date().toISOString().split('T')[0];

    if (sortType === "airing_now") {
        // 正在播出：按热度排序，且首播日期在以前，且完结日期在未来(或为空)
        // TMDB 的 airing_today 逻辑比较复杂，这里用 popularity + 时间范围模拟
        queryParams.sort_by = "popularity.desc";
        queryParams["air_date.lte"] = today; 
        queryParams["air_date.gte"] = getDateShifted(-90); // 过去3个月内有更新的
    } else if (sortType === "top_rated") {
        queryParams.sort_by = "vote_average.desc";
        queryParams["vote_count.gte"] = 200; // 过滤掉冷门高分
    } else if (sortType === "upcoming") {
        queryParams.sort_by = "first_air_date.asc";
        queryParams["first_air_date.gte"] = getDateShifted(1); // 明天以后
    } else if (sortType === "movie_popular") {
        endpoint = "/discover/movie";
        mediaType = "movie";
        queryParams.sort_by = "popularity.desc";
        // 电影不需要 air_date 筛选，直接按热度
    }

    try {
        const res = await Widget.tmdb.get(endpoint, { params: queryParams });
        const data = res || {};
        
        if (!data.results || data.results.length === 0) {
            return [{ id: "empty", type: "text", title: "暂无数据" }];
        }

        return data.results.map(item => {
            const dateStr = item.first_air_date || item.release_date || "";
            const year = dateStr.substring(0, 4);
            const genreText = getGenreText(item.genre_ids);
            const rating = item.vote_average || 0;
            
            // 榜单模式下的副标题：显示评分和原名
            const subTitle = `★ ${rating.toFixed(1)} | ${item.original_name || item.original_title}`;

            return buildItem({
                id: item.id,
                tmdbId: item.id,
                type: mediaType,
                title: item.name || item.title,
                year: year,
                poster: item.poster_path,
                backdrop: item.backdrop_path,
                rating: rating,
                genreText: genreText,
                subTitle: subTitle,
                desc: item.overview
            });
        });

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }];
    }
}

// =========================================================================
// 2. 业务逻辑：追番周见表 (精准日期版)
// =========================================================================

async function loadAnimeWeekly(params = {}) {
    const { weekday = "today", page = 1 } = params;

    // 1. 计算目标日期
    let targetDateStr = "";
    let weekLabel = "";
    
    if (weekday === "today") {
        const d = new Date();
        targetDateStr = d.toISOString().split('T')[0];
        weekLabel = "今日";
    } else {
        // 计算本周的周几对应的日期 (假设本周一到周日)
        targetDateStr = getDateForCurrentWeekDay(parseInt(weekday));
        const weekMap = ["日", "一", "二", "三", "四", "五", "六"];
        weekLabel = `周${weekMap[parseInt(weekday)]}`;
    }

    // 2. 构造查询
    // 逻辑：查询 air_date 正好等于 targetDate 的番剧
    const queryParams = {
        language: "zh-CN",
        page: page,
        with_genres: "16", // 必须是动画
        with_original_language: "ja", // 主要是日漫
        sort_by: "popularity.desc",
        "air_date.gte": targetDateStr,
        "air_date.lte": targetDateStr,
        timezone: "Asia/Shanghai" // 确保时区对齐
    };

    try {
        const res = await Widget.tmdb.get("/discover/tv", { params: queryParams });
        const data = res || {};

        if (!data.results || data.results.length === 0) {
            return page === 1 ? [{ 
                id: "empty", 
                type: "text", 
                title: `${weekLabel}暂无更新`, 
                subTitle: `日期: ${targetDateStr}` 
            }] : [];
        }

        return data.results.map(item => {
            const year = (item.first_air_date || "").substring(0, 4);
            const genreText = getGenreText(item.genre_ids);
            
            // 追番模式下的副标题：必须带上更新日期
            // 这里的 item 不包含具体的 episode 信息，但因为我们是按日期搜的，所以那天肯定有更新
            const subTitle = `📅 更新: ${targetDateStr}`;

            return buildItem({
                id: item.id,
                tmdbId: item.id,
                type: "tv",
                title: item.name,
                year: year,
                poster: item.poster_path,
                backdrop: item.backdrop_path,
                rating: item.vote_average,
                genreText: genreText,
                subTitle: subTitle,
                desc: item.overview
            });
        });

    } catch (e) {
        return [{ id: "err", type: "text", title: "网络错误", subTitle: e.message }];
    }
}

// =========================================================================
// 3. 辅助函数 (日期计算核心)
// =========================================================================

// 获取 N 天后的日期字符串 (支持负数)
function getDateShifted(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// 获取本周某一天 (0=周日, 1=周一...) 的日期字符串
// 逻辑：以“今天”为基准，找到本周的起始（通常视周一为开始），然后偏移
function getDateForCurrentWeekDay(targetDayIndex) {
    const d = new Date();
    const currentDay = d.getDay(); // 0(Sun) - 6(Sat)
    
    // JS 的 getDay() 周日是0。为了方便计算，我们将周日视为7 (如果是以周一为一周开始)
    // 但这里参数 targetDayIndex 传入的是 0-6 (0是周日)
    // 让我们做个简单的对齐：寻找距离今天最近的 "targetDayIndex"
    
    // 算法：计算 diff。
    // 如果今天是周三(3)，目标是周一(1)，diff = -2 (回到过去)
    // 如果今天是周三(3)，目标是周五(5)，diff = +2 (未来)
    
    let diff = targetDayIndex - currentDay;
    
    // 修正逻辑：我们通常希望看到的是 "本周" 的数据
    // 如果今天是周日(0)，我们想看周一的数据，通常是指 "这周一" (也就是6天前) 还是 "下周一"?
    // 为了简单，我们定义：以周一为一周的开始。
    
    // 转换：将 0(Sun) 变成 7
    const todayISO = currentDay === 0 ? 7 : currentDay;
    const targetISO = targetDayIndex === 0 ? 7 : targetDayIndex;
    
    const isoDiff = targetISO - todayISO;
    
    d.setDate(d.getDate() + isoDiff);
    return d.toISOString().split('T')[0];
}
