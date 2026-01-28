WidgetMetadata = {
    id: "trakt_personal_sort_fix",
    title: "Trakt 个人中心 (排序修复)",
    author: "MakkaPakka",
    description: "修复待看列表排序问题，确保【最新添加】始终在最前。",
    version: "4.2.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    globalParams: [
        { name: "traktUser", title: "Trakt 用户名 (必填)", type: "input", value: "" },
        { name: "traktClientId", title: "Trakt Client ID (必填)", type: "input", value: "" }
    ],

    modules: [
        {
            title: "我的片单",
            functionName: "loadTraktProfile",
            type: "list",
            cacheDuration: 300,
            params: [
                {
                    name: "section",
                    title: "浏览区域",
                    type: "enumeration",
                    value: "watchlist",
                    enumOptions: [
                        { title: "📅 追剧日历", value: "updates" },
                        { title: "📜 待看列表", value: "watchlist" },
                        { title: "📦 收藏列表", value: "collection" },
                        { title: "🕒 观看历史", value: "history" }
                    ]
                },
                {
                    name: "type",
                    title: "内容筛选",
                    type: "enumeration",
                    value: "all",
                    belongTo: { paramName: "section", value: ["watchlist", "collection", "history"] },
                    enumOptions: [
                        { title: "全部", value: "all" },
                        { title: "剧集", value: "shows" },
                        { title: "电影", value: "movies" }
                    ]
                },
                // 仅对追剧日历有效
                {
                    name: "updateSort",
                    title: "追剧排序",
                    type: "enumeration",
                    value: "air_date",
                    belongTo: { paramName: "section", value: ["updates"] },
                    enumOptions: [
                        { title: "按更新时间", value: "air_date" },
                        { title: "按观看时间", value: "watched_at" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

async function loadTraktProfile(params = {}) {
    const { traktUser, traktClientId, section, updateSort = "air_date", type = "all", page = 1 } = params;

    if (!traktUser || !traktClientId) return [{ id: "err", type: "text", title: "请填写用户名和Client ID" }];

    // === A. 追剧日历 (Updates) ===
    // (代码与上一版完全一致，此处省略以节省篇幅，重点看 B 部分)
    if (section === "updates") {
        return await loadUpdatesLogic(traktUser, traktClientId, updateSort, page);
    }

    // === B. 常规列表 (Watchlist/History/Collection) ===
    let rawItems = [];
    const sortType = "added,desc"; // 默认按添加时间倒序

    if (type === "all") {
        // 混合模式：同时请求
        const [movies, shows] = await Promise.all([
            fetchTraktList(section, "movies", sortType, page, traktUser, traktClientId),
            fetchTraktList(section, "shows", sortType, page, traktUser, traktClientId)
        ]);
        rawItems = [...movies, ...shows];
    } else {
        // 单模式
        rawItems = await fetchTraktList(section, type, sortType, page, traktUser, traktClientId);
    }

    // --- 核心修复：本地强制排序 ---
    // 无论 API 返回什么顺序，我们都在本地按时间戳强排一遍
    rawItems.sort((a, b) => {
        const timeA = new Date(getItemTime(a, section)).getTime();
        const timeB = new Date(getItemTime(b, section)).getTime();
        // 倒序：大时间（晚）在前
        return timeB - timeA;
    });

    if (!rawItems || rawItems.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "列表为空" }] : [];

    const promises = rawItems.map(async (item) => {
        const subject = item.show || item.movie || item;
        const mediaType = item.show ? "tv" : "movie";
        if (!subject?.ids?.tmdb) return null;

        // 构造副标题
        let subInfo = "";
        const timeStr = getItemTime(item, section);
        if (timeStr) {
            const date = timeStr.split('T')[0];
            if (section === "watchlist") subInfo = `添加于 ${date}`;
            else if (section === "history") subInfo = `观看于 ${date}`;
            else if (section === "collection") subInfo = `收藏于 ${date}`;
        }

        if (type === "all") subInfo = `[${mediaType === "tv" ? "剧" : "影"}] ${subInfo}`;

        return await fetchTmdbDetail(subject.ids.tmdb, mediaType, subInfo, subject.title);
    });

    return (await Promise.all(promises)).filter(Boolean);
}

// 提取时间字段 (核心)
function getItemTime(item, section) {
    // Watchlist: listed_at
    if (section === "watchlist") return item.listed_at;
    // History: watched_at
    if (section === "history") return item.watched_at;
    // Collection: collected_at
    if (section === "collection") return item.collected_at;
    // Fallback
    return item.created_at || "1970-01-01";
}

// 追剧日历逻辑封装
async function loadUpdatesLogic(user, id, sort, page) {
    const url = `https://api.trakt.tv/users/${user}/watched/shows?extended=noseasons&limit=100`;
    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": id }
        });
        const data = res.data || [];
        if (data.length === 0) return [{ id: "empty", type: "text", title: "无观看记录" }];

        const enrichedShows = await Promise.all(data.slice(0, 60).map(async (item) => {
            if (!item.show?.ids?.tmdb) return null;
            const tmdb = await fetchTmdbShowDetails(item.show.ids.tmdb);
            if (!tmdb) return null;
            return {
                trakt: item, tmdb: tmdb,
                airDate: tmdb.last_episode_to_air?.air_date || "1970",
                watchedDate: item.last_watched_at
            };
        }));

        const valid = enrichedShows.filter(Boolean);
        if (sort === "air_date") valid.sort((a, b) => new Date(b.airDate) - new Date(a.airDate));
        else valid.sort((a, b) => new Date(b.watchedDate) - new Date(a.watchedDate));

        const start = (page - 1) * 15;
        return valid.slice(start, start + 15).map(item => {
            const d = item.tmdb;
            let dateLabel = "暂无排期", epInfo = "已完结";
            if (d.next_episode_to_air) {
                dateLabel = `🔜 ${d.next_episode_to_air.air_date}`;
                epInfo = `S${d.next_episode_to_air.season_number}E${d.next_episode_to_air.episode_number}`;
            } else if (d.last_episode_to_air) {
                dateLabel = `📅 ${d.last_episode_to_air.air_date}`;
                epInfo = `S${d.last_episode_to_air.season_number}E${d.last_episode_to_air.episode_number}`;
            }
            return {
                id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: "tv",
                title: d.name, genreTitle: dateLabel, subTitle: epInfo,
                posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
                description: `上次观看: ${item.trakt.last_watched_at.split("T")[0]}\n${d.overview}`
            };
        });
    } catch (e) { return []; }
}

async function fetchTraktList(section, type, sort, page, user, id) {
    // 增加 limit 以支持混合排序的消耗
    // 因为混合排序可能导致前几页全是电影，后几页全是剧集，所以多取点
    const limit = 20; 
    const url = `https://api.trakt.tv/users/${user}/${section}/${type}?extended=full&page=${page}&limit=${limit}`;
    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": id }
        });
        return Array.isArray(res.data) ? res.data : [];
    } catch (e) { return []; }
}

async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        return {
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title || originalTitle,
            genreTitle: year, subTitle: subInfo, description: d.overview,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : ""
        };
    } catch (e) { return null; }
}

async function fetchTmdbShowDetails(id) {
    try { return await Widget.tmdb.get(`/tv/${id}`, { params: { language: "zh-CN" } }); } catch (e) { return null; }
}
