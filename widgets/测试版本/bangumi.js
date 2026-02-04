WidgetMetadata = {
    id: "bangumi_weekly_pro",
    title: "动漫周更表",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
    description: "Bangumi 每日放送表，支持高清封面，类型标签。",
    version: "2.0.0",
    requiredVersion: "0.0.1",
    site: "https://bgm.tv",

    // 0. 全局免 Key
    globalParams: [],

    modules: [
        {
            title: "周更表",
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
                        { title: "📅 今天", value: "today" },
                        { title: "周一 (月)", value: "1" },
                        { title: "周二 (火)", value: "2" },
                        { title: "周三 (水)", value: "3" },
                        { title: "周四 (木)", value: "4" },
                        { title: "周五 (金)", value: "5" },
                        { title: "周六 (土)", value: "6" },
                        { title: "周日 (日)", value: "7" }
                    ]
                },
                // 增加分页参数
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// TMDB 类型映射
const GENRE_MAP = {
    16: "动画", 10759: "动作冒险", 10765: "科幻奇幻", 35: "喜剧", 18: "剧情",
    9648: "悬疑", 80: "犯罪", 10762: "儿童", 10751: "家庭"
};

async function loadBangumiCalendar(params = {}) {
    const { weekday = "today", page = 1 } = params;
    const pageSize = 20; // 每页显示数量

    // 1. 计算 Weekday ID
    let targetDayId = parseInt(weekday);
    if (weekday === "today") {
        const today = new Date();
        const jsDay = today.getDay();
        targetDayId = jsDay === 0 ? 7 : jsDay;
    }
    const dayName = getWeekdayName(targetDayId);

    console.log(`[Bangumi] Fetching Weekday: ${targetDayId}, Page: ${page}`);

    try {
        const res = await Widget.http.get("https://api.bgm.tv/calendar");
        const data = res.data || [];
        const dayData = data.find(d => d.weekday && d.weekday.id === targetDayId);

        if (!dayData || !dayData.items || dayData.items.length === 0) {
            return page === 1 ? [{ id: "empty", type: "text", title: "暂无更新" }] : [];
        }

        // 2. 本地分页逻辑
        const allItems = dayData.items;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        
        if (start >= allItems.length) return []; // 超出范围
        const pageItems = allItems.slice(start, end);

        // 3. 并发匹配 TMDB
        const promises = pageItems.map(async (item) => {
            const title = item.name_cn || item.name;
            const subTitle = item.name;
            const cover = item.images ? (item.images.large || item.images.common) : "";
            
            // 默认 Item
            let finalItem = {
                id: `bgm_${item.id}`,
                type: "tmdb",
                mediaType: "tv",
                title: title,
                subTitle: subTitle, // 原名
                genreTitle: `${dayName} • 动画`, // 默认标签
                posterPath: cover,
                rating: item.rating && item.rating.score ? item.rating.score.toFixed(1) : "0.0",
                description: item.summary || "暂无简介",
                year: ""
            };

            const tmdbItem = await searchTmdbBestMatch(title, subTitle);
            if (tmdbItem) {
                finalItem.id = String(tmdbItem.id);
                finalItem.tmdbId = tmdbItem.id;
                
                // 高清图
                if (tmdbItem.poster_path) finalItem.posterPath = `https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}`;
                if (tmdbItem.backdrop_path) finalItem.backdropPath = `https://image.tmdb.org/t/p/w780${tmdbItem.backdrop_path}`;
                
                // 元数据更新
                finalItem.rating = tmdbItem.vote_average ? tmdbItem.vote_average.toFixed(1) : finalItem.rating;
                finalItem.year = (tmdbItem.first_air_date || "").substring(0, 4);
                if (tmdbItem.overview) finalItem.description = tmdbItem.overview;

                // 【核心 UI】: 周一 • 科幻 / 冒险
                const genres = (tmdbItem.genre_ids || [])
                    .map(id => GENRE_MAP[id])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(" / ");
                
                if (genres) {
                    finalItem.genreTitle = `${dayName} • ${genres}`;
                }
            }

            return finalItem;
        });

        return await Promise.all(promises);

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }];
    }
}

// 辅助工具
function getWeekdayName(id) {
    const map = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
    return map[id] || "";
}

async function searchTmdbBestMatch(query1, query2) {
    let res = await searchTmdb(query1);
    if (!res && query2) res = await searchTmdb(query2);
    return res;
}

async function searchTmdb(query) {
    if (!query) return null;
    const cleanQuery = query.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").trim();
    try {
        const res = await Widget.tmdb.get("/search/tv", {
            params: { query: encodeURIComponent(cleanQuery), language: "zh-CN", page: 1 }
        });
        return (res.results || [])[0];
    } catch (e) { return null; }
}
