WidgetMetadata = {
  id: "variety.trakt.final",
  title: "国产综艺时刻表",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "利用 Trakt 精准获取今日更新的国产综艺",
  version: "1.1.3",
  requiredVersion: "0.0.1",
  site: "https://trakt.tv",

    // 1. 全局参数：所有 Key 都在这里配置
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取综艺的高清海报和中文译名。",
            value: ""
        },
        {
            name: "clientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "默认使用公共 Key，如遇加载失败建议自行填入。",
            value: ""
        }
    ],

    modules: [
        {
            title: "综艺更新",
            functionName: "loadTraktVariety",
            type: "video", // 使用标准 video 类型
            cacheDuration: 3600,
            params: [
                // 仅保留功能性参数
                {
                    name: "mode",
                    title: "查看时间",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "今日更新 (Today)", value: "today" },
                        { title: "明日预告 (Tomorrow)", value: "tomorrow" },
                        { title: "未来 7 天 (Next 7 Days)", value: "week" }
                    ]
                }
            ]
        }
    ]
};

// 默认 Trakt Key (兜底用)
const DEFAULT_CLIENT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadTraktVariety(params = {}) {
    // 1. 从全局参数获取 Key
    const { apiKey, mode = "today" } = params;
    const clientId = params.clientId || DEFAULT_CLIENT_ID;

    if (!apiKey) {
        return [{
            id: "err_no_key",
            type: "text",
            title: "❌ 配置缺失",
            subTitle: "请在设置中填入 TMDB API Key"
        }];
    }

    // 2. 计算日期 (强制北京时间)
    const dateStr = getBeijingDate(mode);
    const days = mode === "week" ? 7 : 1;
    
    console.log(`[Trakt] Fetching CN Variety: ${dateStr} (+${days} days)`);

    // 3. Trakt Calendar API
    // countries=cn: 锁定中国
    // genres=reality,game-show,talk-show: 锁定综艺类型
    const traktUrl = `https://api.trakt.tv/calendars/all/shows/${dateStr}/${days}?countries=cn&genres=reality,game-show,talk-show`;

    try {
        const res = await Widget.http.get(traktUrl, {
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": clientId
            }
        });

        const data = res.data || [];
        
        if (!Array.isArray(data)) return [];
        if (data.length === 0) {
            return [{
                id: "empty",
                type: "text",
                title: "暂无综艺更新",
                subTitle: `${dateStr} 无国产综艺排期`
            }];
        }

        // 4. 并发获取 TMDB 中文数据
        // Trakt 的国产综艺标题可能是拼音，必须去 TMDB 换成中文
        const promises = data.map(async (item) => {
            const show = item.show;
            const episode = item.episode;

            // 必须有 TMDB ID
            if (!show.ids || !show.ids.tmdb) return null;
            
            const tmdbId = show.ids.tmdb;
            
            // 默认对象 (兜底)
            const resultItem = {
                id: String(tmdbId),
                type: "tmdb",
                tmdbId: parseInt(tmdbId),
                mediaType: "tv",
                title: show.title, // Trakt 标题
                subTitle: `🆕 S${episode.season}E${episode.number}`,
                description: `播出时间: ${item.first_aired}`,
                year: (show.year || "").toString(),
                posterPath: "",
                backdropPath: ""
            };

            // 请求 TMDB 详情
            try {
                const tmdbRes = await Widget.http.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
                    params: {
                        api_key: apiKey,
                        language: "zh-CN"
                    }
                });
                
                const tmdbData = tmdbRes.data;
                if (tmdbData) {
                    // 替换为 TMDB 的中文名
                    if (tmdbData.name) resultItem.title = tmdbData.name;
                    // 补充图片
                    if (tmdbData.poster_path) resultItem.posterPath = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
                    if (tmdbData.backdrop_path) resultItem.backdropPath = `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}`;
                    if (tmdbData.vote_average) resultItem.rating = tmdbData.vote_average.toFixed(1);
                    
                    // 优化副标题：如有单集标题则显示
                    const epTitle = episode.title && !episode.title.match(/^Episode \d+$/) 
                        ? episode.title 
                        : `第 ${episode.number} 期`;
                    resultItem.subTitle = `S${episode.season}E${episode.number} · ${epTitle}`;
                }
            } catch (e) {
                // TMDB 失败时仅忽略，保留 Trakt 原始数据
            }

            return resultItem;
        });

        const finalItems = await Promise.all(promises);
        return finalItems.filter(Boolean); // 过滤 null

    } catch (e) {
        console.error("Fetch Error:", e);
        return [{
            id: "err_net",
            type: "text",
            title: "网络请求失败",
            subTitle: e.message
        }];
    }
}

// 日期工具 (强制转换为北京时间 yyyy-MM-dd)
function getBeijingDate(mode) {
    const d = new Date();
    // 转换为 UTC 时间戳 + 8小时毫秒数
    const utc8 = d.getTime() + (d.getTimezoneOffset() * 60000) + (3600000 * 8);
    const cnDate = new Date(utc8);

    if (mode === "tomorrow") {
        cnDate.setDate(cnDate.getDate() + 1);
    }

    const y = cnDate.getFullYear();
    const m = String(cnDate.getMonth() + 1).padStart(2, '0');
    const day = String(cnDate.getDate()).padStart(2, '0');
    
    return `${y}-${m}-${day}`;
}
