WidgetMetadata = {
    id: "douban_tmdb_fusion_v4",
    title: "豆瓣热榜 x TMDB (融合版)",
    author: "Makkapakka",
    description: "豆瓣热榜提供数据源，TMDB补全高清横图与更新时间。支持国产/欧美/日韩/综艺等分类排序。",
    version: "4.0.0",
    requiredVersion: "0.0.1",
    site: "https://movie.douban.com",

    globalParams: [], // 无需配置，开箱即用

    modules: [
        {
            title: "豆瓣全网热榜",
            functionName: "loadDoubanFusion",
            type: "list",
            cacheDuration: 3600, 
            params: [
                {
                    name: "category",
                    title: "榜单分类",
                    type: "enumeration",
                    defaultValue: "tv_domestic",
                    enumOptions: [
                        { title: "🇨🇳 热门国产剧", value: "tv_domestic" },
                        { title: "🇺🇸 热门欧美剧", value: "tv_american" },
                        { title: "🇰🇷 热门韩剧", value: "tv_korean" },
                        { title: "🇯🇵 热门日剧", value: "tv_japanese" },
                        { title: "🔥 综合热门剧集", value: "tv_hot" },
                        { title: "🎤 综合热门综艺", value: "show_hot" },
                        { title: "🇨🇳 国内综艺", value: "show_domestic" },
                        { title: "🌍 国外综艺", value: "show_foreign" },
                        { title: "🎬 热门电影", value: "movie_hot_gaia" }
                    ]
                },
                {
                    name: "sort",
                    title: "二次排序",
                    type: "enumeration",
                    defaultValue: "default",
                    enumOptions: [
                        { title: "🔥 豆瓣默认热度", value: "default" },
                        { title: "📅 按更新时间 (追更)", value: "update" },
                        { title: "🆕 按上映年份 (新片)", value: "release" }
                    ]
                }
            ]
        }
    ]
};

// ==========================================
// 1. 主逻辑
// ==========================================

async function loadDoubanFusion(params = {}) {
    const category = params.category || "tv_domestic";
    const sort = params.sort || "default";

    // 1. 从豆瓣抓取原始列表
    const doubanItems = await fetchDoubanList(category);
    if (!doubanItems || doubanItems.length === 0) {
        return [{ id: "empty", type: "text", title: "豆瓣接口访问失败", subTitle: "请稍后重试" }];
    }

    // 2. 并发去 TMDB 搜索匹配详细信息 (ID, 图片, 时间)
    // 豆瓣给的是中文名，我们去 TMDB 搜这个中文名
    const enrichedItems = await Promise.all(doubanItems.map(async (item) => {
        return await matchTmdb(item);
    }));

    // 过滤掉没匹配到的
    let validItems = enrichedItems.filter(Boolean);

    // 3. 本地二次排序
    if (sort === "update") {
        // 按最后更新时间/上映时间倒序
        validItems.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
    } else if (sort === "release") {
        // 按首播年份倒序
        validItems.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
    }
    // default 保持豆瓣原序

    // 4. 生成卡片
    return validItems.map(item => buildCard(item));
}

// ==========================================
// 2. 豆瓣 API 抓取 (核心)
// ==========================================

async function fetchDoubanList(key) {
    // 构造 Referer 骗过豆瓣防盗链
    const referer = `https://m.douban.com/subject_collection/${key}`;
    // Rexxar 接口地址
    const url = `https://m.douban.com/rexxar/api/v2/subject_collection/${key}/items?start=0&count=40`;

    try {
        const res = await Widget.http.get(url, {
            headers: {
                "Referer": referer,
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36",
                "Host": "m.douban.com"
            }
        });
        
        const json = JSON.parse(res.body || res.data);
        const items = json.subject_collection_items || [];
        
        // 简单清洗数据
        return items.map(i => ({
            doubanId: i.id,
            title: i.title,
            original_title: i.original_title,
            year: i.year,
            // 豆瓣类型: tv, movie, show (综艺)
            // 映射到 TMDB 类型: movie -> movie, 其它 -> tv
            type: (key.includes("movie") || i.type === "movie") ? "movie" : "tv"
        }));

    } catch (e) {
        console.log("Douban Fetch Error: " + e.message);
        return [];
    }
}

// ==========================================
// 3. TMDB 智能匹配 (Mapping)
// ==========================================

async function matchTmdb(doubanItem) {
    const { title, year, type } = doubanItem;
    
    try {
        // 搜索 API
        const searchRes = await Widget.tmdb.search(title, type, { language: "zh-CN" });
        const results = searchRes.results || [];
        
        if (results.length === 0) return null;

        // 🎯 匹配逻辑：找名字最像且年份接近的
        // 豆瓣年份和TMDB年份可能差1年，允许误差
        const targetYear = parseInt(year);
        let bestMatch = results.find(r => {
            const rYear = parseInt((r.first_air_date || r.release_date || "0").substring(0, 4));
            return (rYear === targetYear || rYear === targetYear - 1 || rYear === targetYear + 1);
        });

        // 如果没找到年份匹配的，就取第一个结果 (通常是正确的)
        if (!bestMatch) bestMatch = results[0];

        // 获取详情 (为了拿具体的集数信息和高清图)
        const detail = await Widget.tmdb.get(`/${type}/${bestMatch.id}`, { params: { language: "zh-CN" } });

        // 提取时间信息
        let sortDate = "1900-01-01";
        let nextEp = null;
        let lastEp = null;
        let releaseDate = detail.first_air_date || detail.release_date || "1900-01-01";

        if (type === "tv") {
            nextEp = detail.next_episode_to_air;
            lastEp = detail.last_episode_to_air;
            // 排序时间：如果有下一集，或者最后一集，取其时间
            if (lastEp) sortDate = lastEp.air_date;
            else sortDate = releaseDate;
        } else {
            sortDate = releaseDate;
        }

        return {
            tmdb: detail,
            douban: doubanItem,
            mediaType: type,
            sortDate: sortDate,
            releaseDate: releaseDate,
            nextEp: nextEp,
            lastEp: lastEp
        };

    } catch (e) {
        return null;
    }
}

// ==========================================
// 4. UI 构建 (横图 + 01-30 日期)
// ==========================================

function buildCard(item) {
    const d = item.tmdb;
    const typeLabel = item.mediaType === "tv" ? "剧" : "影";
    
    // 🖼️ 图片：优先 Backdrop (w780)
    let imagePath = "";
    if (d.backdrop_path) imagePath = `https://image.tmdb.org/t/p/w780${d.backdrop_path}`;
    else if (d.poster_path) imagePath = `https://image.tmdb.org/t/p/w500${d.poster_path}`;

    // 📅 日期与副标题
    let subTitle = "";
    let genreTitle = ""; // 右侧显示
    
    if (item.mediaType === "tv") {
        // 剧集/综艺逻辑
        if (item.nextEp) {
            // 待播
            const dateStr = formatShortDate(item.nextEp.air_date);
            subTitle = `🔜 ${dateStr} 更新 S${item.nextEp.season_number}E${item.nextEp.episode_number}`;
            genreTitle = dateStr;
        } else if (item.lastEp) {
            // 已播最新
            const dateStr = formatShortDate(item.lastEp.air_date);
            // 综艺通常按日期显示，剧集按集数
            // 如果是国产综艺，名字通常就是标题
            if (d.status === "Ended" || d.status === "Canceled") {
                subTitle = `[${typeLabel}] 全剧终`;
                genreTitle = "End";
            } else {
                subTitle = `📅 ${dateStr} 更新 S${item.lastEp.season_number}E${item.lastEp.episode_number}`;
                genreTitle = dateStr;
            }
        } else {
            // 无具体集数信息
            const year = (d.first_air_date || "").substring(0, 4);
            subTitle = `[${typeLabel}] ${year}`;
            genreTitle = year;
        }
    } else {
        // 电影逻辑
        const dateStr = formatShortDate(d.release_date);
        subTitle = `🎬 ${dateStr} 上映`;
        genreTitle = (d.release_date || "").substring(0, 4);
    }
    
    // 豆瓣评分补充 (如果有)
    // 可以在 description 里加上豆瓣标题，防止 TMDB 搜歪了
    const desc = d.overview || "";

    return {
        id: `douban_${d.id}`,
        tmdbId: d.id, // 核心：用于 Forward 播放资源
        type: "tmdb",
        mediaType: item.mediaType,
        title: d.name || d.title, // TMDB 中文名
        subTitle: subTitle,
        genreTitle: genreTitle,
        description: desc,
        posterPath: imagePath
    };
}

// 格式化日期 MM-DD
function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${m}-${d}`;
}
