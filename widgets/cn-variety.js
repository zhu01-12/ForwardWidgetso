WidgetMetadata = {
  id: "variety.trakt.final",
  title: "国产综艺时刻表",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "利用 Trakt 精准获取今日更新的国产综艺",
  version: "1.1.4",
  requiredVersion: "0.0.1",
  site: "https://trakt.tv",

    globalParams: [
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "默认使用公共 Key。",
            value: ""
        }
    ],

    modules: [
        {
            title: "综艺更新",
            functionName: "loadVariety",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "mode",
                    title: "查看时间",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "今日更新", value: "today" },
                        { title: "明日预告", value: "tomorrow" },
                        { title: "近期热播 (TMDB源)", value: "trending" } // 新增一个稳定选项
                    ]
                }
            ]
        }
    ]
};

const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadVariety(params = {}) {
    const { mode = "today", traktClientId } = params;
    const clientId = traktClientId || DEFAULT_TRAKT_ID;

    // 1. 如果用户选了 "近期热播"，直接走 TMDB，稳如老狗
    if (mode === "trending") {
        return await fetchTmdbVariety();
    }

    // 2. 常规逻辑：先试 Trakt
    const dateStr = getBeijingDate(mode);
    console.log(`[Trakt] Fetching ${dateStr}...`);
    
    // 稍微放宽一点，country=cn 即可，不要强制 genre，以免漏掉 tag 打错的
    // 或者保持 genre，看看是否有数据
    const traktUrl = `https://api.trakt.tv/calendars/all/shows/${dateStr}/1?countries=cn&genres=reality,game-show,talk-show`;

    try {
        const res = await Widget.http.get(traktUrl, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId }
        });

        const data = res.data || [];
        
        // 3. 如果 Trakt 有数据，处理并返回
        if (Array.isArray(data) && data.length > 0) {
            console.log(`[Trakt] Got ${data.length} items.`);
            const promises = data.map(async (item) => {
                // ... (Trakt 数据处理逻辑同前)
                if (!item.show.ids.tmdb) return null;
                return await fetchTmdbDetail(item.show.ids.tmdb, item);
            });
            return (await Promise.all(promises)).filter(Boolean);
        } else {
            console.log("[Trakt] Empty, switching to TMDB fallback...");
        }
    } catch (e) {
        console.error("[Trakt] Error:", e);
    }

    // 4. 兜底逻辑：Trakt 没数据，走 TMDB Discover
    // 既然 Trakt 说今天没综艺，那我们就推荐点"最近更新"的综艺，总比空白好
    return await fetchTmdbVariety(dateStr);
}

// ==========================================
// TMDB 兜底/直连逻辑
// ==========================================

async function fetchTmdbVariety(targetDate = null) {
    // TMDB Discover: 
    // - Origin Country: CN
    // - Genres: Reality(10764) OR Talk(10767)
    // - Sort: 播出日期降序 (或者热度)
    // - Air Date <= Today (只看已经出的)
    
    let url = `/discover/tv?language=zh-CN&sort_by=first_air_date.desc&page=1&with_origin_country=CN&with_genres=10764|10767&include_null_first_air_dates=false`;
    
    // 如果指定了日期（比如是兜底模式），我们可以尝试筛选 air_date
    // 但 TMDB Discover 的 air_date.gte/lte 筛选的是"首播日期"，对于"综艺的某一集更新"支持不好。
    // 所以最佳策略是：直接拉取"最近热播的综艺"，并在副标题提示"近期热播"
    
    try {
        const res = await Widget.tmdb.get(url);
        const results = res.results || [];
        
        if (results.length === 0) {
            return [{ id: "empty", type: "text", title: "暂无数据", subTitle: "TMDB 也暂无国产综艺记录" }];
        }

        return results.map(item => {
            const date = item.first_air_date || item.release_date || "";
            const year = date.substring(0, 4);
            const rating = item.vote_average ? item.vote_average.toFixed(1) : "0.0";
            
            // 构造 UI
            return {
                id: String(item.id),
                tmdbId: item.id,
                type: "tmdb",
                mediaType: "tv",
                
                title: item.name,
                // 这里我们不知道具体是哪一集更新，所以显示"近期热播"
                subTitle: `近期热播 · ⭐ ${rating}`, 
                genreTitle: `${year} • 综艺`,
                
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
                description: item.overview || "暂无简介"
            };
        });
    } catch (e) {
        return [{ id: "err", type: "text", title: "TMDB 连接失败" }];
    }
}

// 辅助：Trakt 单项转 Forward Item
async function fetchTmdbDetail(tmdbId, traktItem) {
    try {
        const d = await Widget.tmdb.get(`/tv/${tmdbId}`, { params: { language: "zh-CN" } });
        if (!d) return null;
        
        const ep = traktItem.episode;
        const airTime = traktItem.first_aired.split("T")[0];
        const genres = (d.genres || []).map(g => g.name).slice(0, 2).join(" / ");

        return {
            id: String(d.id),
            tmdbId: d.id,
            type: "tmdb",
            mediaType: "tv",
            title: d.name || traktItem.show.title,
            genreTitle: [airTime, genres].filter(Boolean).join(" • "),
            subTitle: `S${ep.season}E${ep.number} · ${ep.title || "更新"}`,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
            description: d.overview,
            rating: d.vote_average?.toFixed(1),
            year: (d.first_air_date || "").substring(0, 4)
        };
    } catch (e) { return null; }
}

function getBeijingDate(mode) {
    const d = new Date();
    const utc8 = d.getTime() + (d.getTimezoneOffset() * 60000) + (3600000 * 8);
    const cnDate = new Date(utc8);
    if (mode === "tomorrow") cnDate.setDate(cnDate.getDate() + 1);
    const y = cnDate.getFullYear();
    const m = String(cnDate.getMonth() + 1).padStart(2, '0');
    const day = String(cnDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
