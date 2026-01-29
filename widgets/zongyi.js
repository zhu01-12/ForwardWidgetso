WidgetMetadata = {
    id: "variety_hub_ultimate",
    title: "全球综艺热度榜&更新表",
    author: "Makkapakka",
    description: "综艺热度榜与追新榜。",
    version: "1.0.4",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    modules: [
        {
            title: "综艺聚合",
            functionName: "loadVarietyUltimate",
            type: "list",
            cacheDuration: 300, // 5分钟刷新，保证时间准确
            params: [
                {
                    name: "listType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "calendar",
                    enumOptions: [
                        { title: "📅 追新榜 (按更新时间)", value: "calendar" },
                        { title: "🔥 热度榜 (按流行度)", value: "hot" }
                    ]
                },
                {
                    name: "region",
                    title: "地区筛选",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "🌏 全部地区", value: "all" },
                        { title: "🇨🇳 国内综艺", value: "cn" },
                        { title: "✈️ 国外综艺", value: "global" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// =========================================================================
// 0. 工具函数
// =========================================================================

const GENRE_MAP = {
    10764: "真人秀", 10767: "脱口秀", 10763: "新闻", 
    35: "喜剧", 10751: "家庭", 18: "剧情"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "综艺";
    const genres = ids.map(id => GENRE_MAP[id]).filter(Boolean);
    return genres.length > 0 ? genres[0] : "综艺";
}

// 格式化日期 MM-30
function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${m}-${d}`;
}

// =========================================================================
// 1. 核心逻辑
// =========================================================================

async function loadVarietyUltimate(params = {}) {
    const { listType = "calendar", region = "all", page = 1 } = params;

    // 1. 第一步：先用 Discover 接口捞出一堆“候选人”
    // 我们多捞一点 (limit 40)，因为后面要根据日期过滤，可能会刷掉很多
    let discoverUrl = `/discover/tv`;
    let queryParams = {
        language: "zh-CN",
        page: page,
        with_genres: "10764|10767", // 真人秀 OR 脱口秀
        sort_by: "popularity.desc", // 先按热度捞，保证捞出来的都是有人看的
        "vote_count.gte": 0,
        include_null_first_air_dates: false
    };

    // 地区筛选逻辑
    if (region === "cn") {
        queryParams.with_origin_country = "CN";
    } else if (region === "global") {
        // 排除中国，或者指定热门国家
        queryParams.with_origin_country = "US|KR|JP|GB|TW|HK|TH";
    }

    // 如果是追新榜，我们尽量只看“正在播出”的，减少无效请求
    if (listType === "calendar") {
        queryParams.with_status = "0|1|2"; // Returning Series (2) 等
    }

    try {
        const res = await Widget.tmdb.get(discoverUrl, { params: queryParams });
        const rawResults = res.results || [];

        if (rawResults.length === 0) return [];

        // 2. 第二步：暴力详情 (复刻你的 reference 代码)
        // 并发请求每一个综艺的详情页，获取 next_episode_to_air
        const detailPromises = rawResults.map(async (item) => {
            // 严选：必须有海报
            if (!item.poster_path) return null;

            try {
                // 请求详情，获取 vital 的排期信息
                const detail = await Widget.tmdb.get(`/tv/${item.id}`, { 
                    params: { language: "zh-CN" } 
                });
                
                // 提取关键信息
                const nextEp = detail.next_episode_to_air;
                const lastEp = detail.last_episode_to_air;
                
                // 计算排序用的日期
                // 逻辑：如果有下一集，用下一集时间；如果没下一集，用上一集时间（刚更新完）
                let sortDate = "1970-01-01";
                let displayDateLabel = "";
                let displayEpLabel = "";
                let isFuture = false;

                if (nextEp) {
                    sortDate = nextEp.air_date;
                    isFuture = true;
                    displayDateLabel = formatShortDate(sortDate);
                    displayEpLabel = `S${nextEp.season_number}E${nextEp.episode_number}`;
                } else if (lastEp) {
                    sortDate = lastEp.air_date;
                    isFuture = false;
                    displayDateLabel = formatShortDate(sortDate);
                    displayEpLabel = `S${lastEp.season_number}E${lastEp.episode_number}`;
                } else {
                    // 既没下一集也没上一集（数据缺失），如果是追新榜则丢弃
                    if (listType === "calendar") return null;
                    sortDate = item.first_air_date;
                }

                return {
                    original: item,
                    detail: detail,
                    sortDate: sortDate,
                    isFuture: isFuture,
                    displayDateLabel: displayDateLabel,
                    displayEpLabel: displayEpLabel
                };
            } catch (e) {
                return null;
            }
        });

        // 等待所有详情加载完毕
        const detailedItems = (await Promise.all(detailPromises)).filter(Boolean);

        // 3. 第三步：根据榜单类型进行排序和过滤
        let finalItems = detailedItems;

        if (listType === "calendar") {
            // 📅 追新榜逻辑
            const today = new Date().toISOString().split('T')[0];
            
            // 过滤：只保留最近更新的 (比如最近7天播出的，或者未来要播出的)
            // 太久远的（比如去年完结的）不要出现在追新榜里
            finalItems = finalItems.filter(item => {
                // 如果是未来的，保留
                if (item.sortDate >= today) return true;
                // 如果是过去的，只保留最近 14 天内的
                const pastDateLimit = new Date();
                pastDateLimit.setDate(pastDateLimit.getDate() - 14);
                const limitStr = pastDateLimit.toISOString().split('T')[0];
                return item.sortDate >= limitStr;
            });

            // 排序：按照日期排序 (30号, 31号, 1号...)
            // 使用 sortDate 字符串比较即可 (YYYY-MM-DD)
            finalItems.sort((a, b) => {
                if (a.sortDate === b.sortDate) return 0;
                return a.sortDate < b.sortDate ? -1 : 1; // 升序：近日 -> 远日
            });
        } 
        else {
            // 🔥 热度榜逻辑：保持原样 (Popularity Desc)，不需要重排
        }

        // 4. 第四步：构建 UI
        return finalItems.map(data => {
            const { detail, displayDateLabel, displayEpLabel, sortDate } = data;
            
            // 构建副标题
            const genre = getGenreText(detail.genres ? detail.genres.map(g => g.id) : []);
            
            let subTitleStr = "";
            let genreTitleStr = "";

            if (listType === "calendar") {
                // 追新榜样式： [1-30] [真人秀]
                // 你的要求：副标题写上最新一集的更新时间和类型
                // 例如：1-30 真人秀
                genreTitleStr = `${displayDateLabel} ${genre}`; // 显示在右上角或者第一行小字
                subTitleStr = `${displayDateLabel} ${genre} • ${displayEpLabel}`; // 显示在副标题
            } else {
                // 热度榜样式
                genreTitleStr = `${detail.vote_average.toFixed(1)}分`;
                subTitleStr = `🔥 ${detail.popularity.toFixed(0)}热度 • ${genre}`;
            }

            return {
                id: String(detail.id),
                tmdbId: detail.id,
                type: "tmdb",
                mediaType: "tv",
                title: detail.name || detail.original_name,
                // 这里的 genreTitle 在部分布局中显示在标题旁边/上方
                genreTitle: genreTitleStr, 
                subTitle: subTitleStr,
                posterPath: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : "",
                backdropPath: detail.backdrop_path ? `https://image.tmdb.org/t/p/w780${detail.backdrop_path}` : "",
                description: `更新日期: ${sortDate}\n${detail.overview || "暂无简介"}`,
                rating: detail.vote_average ? detail.vote_average.toFixed(1) : "0.0",
                year: (detail.first_air_date || "").substring(0, 4)
            };
        });

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }];
    }
}
