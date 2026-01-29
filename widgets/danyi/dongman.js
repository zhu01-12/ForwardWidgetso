WidgetMetadata = {
    id: "anime_hub_ultimate",
    title: "全球动漫榜 (严选追更版)",
    author: "Makkapakka",
    description: "TMDB 驱动。支持日漫新番、国产动画追更表。精准显示最新集更新时间。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    modules: [
        {
            title: "新番索引",
            functionName: "loadAnimeUltimate",
            type: "list",
            cacheDuration: 300, 
            params: [
                {
                    name: "listType",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "calendar",
                    enumOptions: [
                        { title: "📅 追番表 (按更新时间)", value: "calendar" },
                        { title: "🔥 热门榜 (按流行度)", value: "hot" }
                    ]
                },
                {
                    name: "region",
                    title: "地区筛选",
                    type: "enumeration",
                    value: "jp", // 动漫默认看日漫
                    enumOptions: [
                        { title: "🇯🇵 日本新番", value: "jp" },
                        { title: "🇨🇳 国产动画", value: "cn" },
                        { title: "🇺🇸 欧美/其他", value: "global" }
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

// 动漫常见分类映射
const GENRE_MAP = {
    16: "动画",
    10759: "动作冒险", 
    10765: "科幻奇幻", 
    35: "喜剧", 
    18: "剧情", 
    9648: "悬疑",
    10762: "儿童"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "动画";
    // 过滤掉 "动画(16)" 本身，优先显示副分类（如：科幻、动作）
    const subGenres = ids.filter(id => id !== 16).map(id => GENRE_MAP[id]).filter(Boolean);
    return subGenres.length > 0 ? subGenres[0] : "动画";
}

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

async function loadAnimeUltimate(params = {}) {
    const { listType = "calendar", region = "jp", page = 1 } = params;

    // 1. Discover 筛选候选列表
    let discoverUrl = `/discover/tv`;
    let queryParams = {
        language: "zh-CN",
        page: page,
        with_genres: "16", // 核心：只看动画分类
        sort_by: "popularity.desc", // 先按热度捞
        "vote_count.gte": 0,
        include_null_first_air_dates: false
    };

    // 地区逻辑：动漫用户对地区非常敏感
    if (region === "jp") {
        queryParams.with_origin_country = "JP"; // 纯正日漫
    } else if (region === "cn") {
        queryParams.with_origin_country = "CN|HK|TW"; // 国漫
    } else if (region === "global") {
        // 排除中日，看欧美漫
        // TMDB discover 不支持 exclude_origin_country，这里暂时不限制，
        // 靠后续逻辑或只筛选 US/GB。为了准确，这里指定常见欧美国家。
        queryParams.with_origin_country = "US|GB|FR|KR"; 
    }

    // 追番模式下，尽量排除已完结太久的老番，提高命中率
    if (listType === "calendar") {
        queryParams.with_status = "0|1|2|3"; // 排除 Canceled(4) 等
        // 可选：限制首播时间在最近几年，防止捞出龙珠Z这种老物占位（虽然老物可能有新集，但概率低）
        // queryParams["first_air_date.gte"] = "2000-01-01"; 
    }

    try {
        const res = await Widget.tmdb.get(discoverUrl, { params: queryParams });
        const rawResults = res.results || [];

        if (rawResults.length === 0) return [];

        // 2. 暴力详情：获取 precise date
        const detailPromises = rawResults.map(async (item) => {
            if (!item.poster_path) return null;

            try {
                const detail = await Widget.tmdb.get(`/tv/${item.id}`, { 
                    params: { language: "zh-CN" } 
                });
                
                const nextEp = detail.next_episode_to_air;
                const lastEp = detail.last_episode_to_air;
                
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
            } catch (e) { return null; }
        });

        const detailedItems = (await Promise.all(detailPromises)).filter(Boolean);
        let finalItems = detailedItems;

        // 3. 排序与过滤
        if (listType === "calendar") {
            const today = new Date().toISOString().split('T')[0];
            
            finalItems = finalItems.filter(item => {
                if (item.sortDate >= today) return true; // 未来
                // 过去14天内
                const limit = new Date();
                limit.setDate(limit.getDate() - 14);
                return item.sortDate >= limit.toISOString().split('T')[0];
            });

            // 日期升序 (临近的在前面)
            finalItems.sort((a, b) => {
                if (a.sortDate === b.sortDate) return 0;
                return a.sortDate < b.sortDate ? -1 : 1; 
            });
        }

        // 4. 构建 UI
        return finalItems.map(data => {
            const { detail, displayDateLabel, displayEpLabel, sortDate } = data;
            
            // 提取类型：如果是“动画”，尝试显示第二个类型（如“科幻”）
            const genre = getGenreText(detail.genres ? detail.genres.map(g => g.id) : []);
            
            let subTitleStr = "";
            let genreTitleStr = "";

            if (listType === "calendar") {
                // 追番样式: [1-30] [动作冒险]
                genreTitleStr = `${displayDateLabel} ${genre}`; 
                // 副标题: 1-30 • S02E12
                subTitleStr = `${displayDateLabel} • ${displayEpLabel}`;
            } else {
                genreTitleStr = `${detail.vote_average.toFixed(1)}分`;
                subTitleStr = `🔥 ${detail.popularity.toFixed(0)}热度 • ${genre}`;
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
                description: `更新日期: ${sortDate}\n${detail.overview || "暂无简介"}`,
                rating: detail.vote_average ? detail.vote_average.toFixed(1) : "0.0",
                year: (detail.first_air_date || "").substring(0, 4)
            };
        });

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }];
    }
}
