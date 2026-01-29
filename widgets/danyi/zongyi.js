WidgetMetadata = {
    id: "variety_hub_ultimate_v3",
    title: "全球综艺榜 (满血版)",
    author: "Makkapakka",
    description: "聚合全球综艺。追新榜支持 7/14/30 天范围选择，智能填满列表。",
    version: "3.0.0",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    modules: [
        {
            title: "综艺聚合",
            functionName: "loadVarietyUltimate",
            type: "list",
            cacheDuration: 300, 
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
                // === 新增：时间范围选择 ===
                {
                    name: "days",
                    title: "追更范围",
                    type: "enumeration",
                    value: "14",
                    // 仅在“追新榜”模式下显示
                    belongTo: { paramName: "listType", value: ["calendar"] },
                    enumOptions: [
                        { title: "最近 7 天", value: "7" },
                        { title: "最近 14 天", value: "14" },
                        { title: "最近 30 天", value: "30" }
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
    // 优先显示真人秀/脱口秀，没有则显示第一个
    const target = ids.find(id => id === 10764 || id === 10767) || ids[0];
    return GENRE_MAP[target] || "综艺";
}

// 格式化日期 MM-30
function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${m}-${d}`;
}

// 计算 N 天前的日期 (YYYY-MM-DD)
function getPastDateStr(days) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(days));
    return d.toISOString().split('T')[0];
}

// 计算 N 天后的日期 (YYYY-MM-DD)
function getFutureDateStr(days) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(days));
    return d.toISOString().split('T')[0];
}

// =========================================================================
// 1. 核心逻辑
// =========================================================================

async function loadVarietyUltimate(params = {}) {
    const { listType = "calendar", region = "all", days = "14", page = 1 } = params;

    // 基础 API 地址
    let discoverUrl = `/discover/tv`;
    
    // 基础查询参数
    let queryParams = {
        language: "zh-CN",
        page: page,
        with_genres: "10764|10767", // 限定综艺类目
        sort_by: "popularity.desc", // 在符合条件的结果里，按热度排
        "vote_count.gte": 0,
        include_null_first_air_dates: false
    };

    // 1. 地区筛选
    if (region === "cn") {
        queryParams.with_origin_country = "CN";
    } else if (region === "global") {
        queryParams.with_origin_country = "US|KR|JP|GB|TW|HK|TH";
    }

    // 2. 模式差异化处理 (关键优化点)
    if (listType === "calendar") {
        // === 追新榜逻辑 ===
        
        // 关键优化：告诉 TMDB 只要最近更新的！
        // 这样每一页返回的 20 条数据全是有效的，不再会出现“数据很少”的情况。
        const startDate = getPastDateStr(days); // 例如 14天前
        const endDate = getFutureDateStr(7);    // 往后预读 7 天，涵盖今天和明天的更新

        // TMDB 的 air_date 过滤器：筛选在该时间段内有剧集播出的节目
        queryParams["air_date.gte"] = startDate;
        queryParams["air_date.lte"] = endDate;
        
    } else {
        // === 热度榜逻辑 ===
        // 不限制更新时间，只看总体热度
    }

    try {
        const res = await Widget.tmdb.get(discoverUrl, { params: queryParams });
        const rawResults = res.results || [];

        if (rawResults.length === 0) return [];

        // 3. 详情获取与严选
        const detailPromises = rawResults.map(async (item) => {
            // 严选 1: 必须有海报
            if (!item.poster_path) return null;

            try {
                // 请求详情获取精准集数信息
                const detail = await Widget.tmdb.get(`/tv/${item.id}`, { 
                    params: { language: "zh-CN" } 
                });
                
                // 提取排期
                const nextEp = detail.next_episode_to_air;
                const lastEp = detail.last_episode_to_air;
                
                let sortDate = "1970-01-01";
                let displayDateLabel = "";
                let displayEpLabel = "";

                // 优先显示下一集（如果有），否则显示刚播出的上一集
                if (nextEp) {
                    sortDate = nextEp.air_date;
                    displayDateLabel = formatShortDate(sortDate);
                    displayEpLabel = `S${nextEp.season_number}E${nextEp.episode_number}`;
                } else if (lastEp) {
                    sortDate = lastEp.air_date;
                    displayDateLabel = formatShortDate(sortDate);
                    displayEpLabel = `S${lastEp.season_number}E${lastEp.episode_number}`;
                } else {
                    // 数据不全时的兜底 (通常 discover 筛选过 air_date 不会进这里)
                    if (listType === "calendar") return null;
                    sortDate = item.first_air_date;
                }

                return {
                    detail: detail,
                    sortDate: sortDate,
                    displayDateLabel: displayDateLabel,
                    displayEpLabel: displayEpLabel
                };
            } catch (e) {
                return null;
            }
        });

        // 等待并发请求完成
        const detailedItems = (await Promise.all(detailPromises)).filter(Boolean);

        // 4. 二次排序 (仅追新榜需要)
        // 虽然 TMDB 返回的是按热度排的，但追新榜用户通常喜欢按“日期”看
        if (listType === "calendar") {
            // 按日期倒序 (最近的在前面：今天 -> 昨天 -> 前天)
            // 或者按日期正序 (旧 -> 新)？
            // 既然是“追更”，通常想看今天更新了啥，然后是昨天。
            detailedItems.sort((a, b) => {
                if (a.sortDate === b.sortDate) return 0;
                return a.sortDate < b.sortDate ? 1 : -1; // 降序：30号, 29号, 28号...
            });
        }

        // 5. 构建 UI
        return detailedItems.map(data => {
            const { detail, displayDateLabel, displayEpLabel, sortDate } = data;
            
            const genre = getGenreText(detail.genres ? detail.genres.map(g => g.id) : []);
            
            let subTitleStr = "";
            let genreTitleStr = "";

            if (listType === "calendar") {
                // 追新榜样式
                // 副标题：1-30 真人秀
                // 标题旁：最新集数
                genreTitleStr = displayEpLabel; // 例如 S1E5
                subTitleStr = `${displayDateLabel} 更新 • ${genre}`; // 例如 1-30 更新 • 真人秀
            } else {
                // 热度榜样式
                genreTitleStr = `${detail.vote_average.toFixed(1)}分`;
                subTitleStr = `🔥 热度 ${Math.round(detail.popularity)} • ${genre}`;
            }

            return {
                id: String(detail.id),
                tmdbId: detail.id,
                type: "tmdb",
                mediaType: "tv",
                title: detail.name || detail.original_name,
                genreTitle: genreTitleStr, 
                subTitle: subTitleStr,
                posterPath: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : "",
                backdropPath: detail.backdrop_path ? `https://image.tmdb.org/t/p/w780${detail.backdrop_path}` : "",
                description: `📅 更新日期: ${sortDate}\n${detail.overview || "暂无简介"}`,
                rating: detail.vote_average ? detail.vote_average.toFixed(1) : "0.0",
                year: (detail.first_air_date || "").substring(0, 4)
            };
        });

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }];
    }
}
