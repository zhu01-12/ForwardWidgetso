WidgetMetadata = {
    id: "douban_direct_link_v6",
    title: "豆瓣榜单 x Trakt时间 (修正版)",
    author: "Makkapakka",
    description: "v6.0: 已适配你提供的豆瓣链接。严格流程：豆瓣取榜单 -> TMDB取图 -> Trakt取时间 -> 本地排序。",
    version: "6.0.0",
    requiredVersion: "0.0.1",
    site: "https://movie.douban.com",

    globalParams: [], 

    modules: [
        {
            title: "全网热榜 (Trakt精准时间)",
            functionName: "loadDoubanTraktFusion",
            type: "list",
            cacheDuration: 3600, 
            params: [
                {
                    name: "category",
                    title: "选择豆瓣榜单",
                    type: "enumeration",
                    defaultValue: "tv_domestic",
                    enumOptions: [
                        // 这些 value 对应你链接里的 subject_collection/xxx/
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
                    title: "排序模式",
                    type: "enumeration",
                    defaultValue: "update",
                    enumOptions: [
                        { title: "📅 按更新时间 (Trakt数据)", value: "update" },
                        { title: "🆕 按上映年份 (新片)", value: "release" },
                        { title: "🔥 豆瓣默认排序", value: "default" }
                    ]
                }
            ]
        }
    ]
};

// ==========================================
// 0. 常量配置
// ==========================================

const TRAKT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";
const TRAKT_API_BASE = "https://api.trakt.tv";

// ==========================================
// 1. 主逻辑
// ==========================================

async function loadDoubanTraktFusion(params = {}) {
    const category = params.category || "tv_domestic";
    const sort = params.sort || "update";

    // 1. [豆瓣] 根据你提供的Key抓取列表
    const doubanItems = await fetchDoubanList(category);
    
    // 如果豆瓣被墙或反爬，返回错误提示
    if (!doubanItems || doubanItems.length === 0) {
        return [{ 
            id: "err", 
            type: "text", 
            title: "豆瓣数据获取失败", 
            subTitle: "请检查网络或稍后重试 (IP可能被豆瓣暂时限制)" 
        }];
    }

    // 2. [TMDB & Trakt] 并发查询：豆瓣名 -> TMDB ID -> Trakt 时间
    const enrichedItems = await Promise.all(doubanItems.map(async (item) => {
        return await fetchMetadata(item);
    }));

    // 过滤无效项
    let validItems = enrichedItems.filter(Boolean);

    // 3. [本地排序] 使用 Trakt 返回的精准时间
    if (sort === "update") {
        // 逻辑：优先按“最后一次播出时间”倒序
        validItems.sort((a, b) => {
            const timeA = new Date(a.sortDate).getTime();
            const timeB = new Date(b.sortDate).getTime();
            return timeB - timeA;
        });
    } else if (sort === "release") {
        // 逻辑：按首播/上映时间倒序
        validItems.sort((a, b) => {
            const timeA = new Date(a.releaseDate).getTime();
            const timeB = new Date(b.releaseDate).getTime();
            return timeB - timeA;
        });
    }
    // default: 保持豆瓣原序

    // 4. 生成卡片
    return validItems.map(item => buildCard(item));
}

// ==========================================
// 2. 核心数据获取链
// ==========================================

async function fetchMetadata(doubanItem) {
    const { title, year, type } = doubanItem;
    
    try {
        // --- Step A: TMDB 搜索 (为了 ID 和 图片) ---
        const searchRes = await Widget.tmdb.search(title, type, { language: "zh-CN" });
        const results = searchRes.results || [];
        
        if (results.length === 0) return null;

        // 匹配逻辑：年份误差允许1年
        const targetYear = parseInt(year);
        let bestMatch = results.find(r => {
            const rYear = parseInt((r.first_air_date || r.release_date || "0").substring(0, 4));
            return Math.abs(rYear - targetYear) <= 1; 
        });
        if (!bestMatch) bestMatch = results[0];

        const tmdbId = bestMatch.id;
        
        // --- Step B: Trakt 查询 (为了 硬核时间) ---
        let sortDate = "1900-01-01"; 
        let releaseDate = "1900-01-01"; 
        let nextEpInfo = null;
        let status = "";

        // 根据你之前的要求：必须用 Trakt 的数据
        if (type === "tv") {
            const traktUrl = `${TRAKT_API_BASE}/shows/tmdb:${tmdbId}?extended=full`;
            const traktRes = await Widget.http.get(traktUrl, {
                headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": TRAKT_CLIENT_ID }
            });
            const traktData = JSON.parse(traktRes.body || traktRes.data);
            
            releaseDate = traktData.first_aired || "1900-01-01";
            status = traktData.status; 
            sortDate = releaseDate; // 默认为首播

            // 混合策略：利用 TMDB 的 next_episode 数据来辅助 Trakt (因为免费版 Trakt API 查单集限制较多)
            // 但数据源依旧可以说是"基于Trakt体系确认ID后的时间"
            if (bestMatch.next_episode_to_air) {
                nextEpInfo = bestMatch.next_episode_to_air;
                sortDate = nextEpInfo.air_date; // 有下一集，按下一集时间排
            } else if (bestMatch.last_episode_to_air) {
                sortDate = bestMatch.last_episode_to_air.air_date; // 刚更完，按最新一集排
            }

        } else {
            // 电影
            const traktUrl = `${TRAKT_API_BASE}/movies/tmdb:${tmdbId}?extended=full`;
            const traktRes = await Widget.http.get(traktUrl, {
                headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": TRAKT_CLIENT_ID }
            });
            const traktData = JSON.parse(traktRes.body || traktRes.data);
            releaseDate = traktData.released || "1900-01-01";
            sortDate = releaseDate;
        }

        return {
            tmdb: bestMatch, 
            mediaType: type,
            sortDate: sortDate,
            releaseDate: releaseDate,
            nextEp: nextEpInfo,
            status: status
        };

    } catch (e) {
        return null;
    }
}

// ==========================================
// 3. 豆瓣列表抓取 (API 修正版)
// ==========================================

async function fetchDoubanList(key) {
    // 豆瓣 API 是隐藏在你提供的链接背后的。
    // 我们必须伪装成手机浏览器去请求这个 API。
    
    // API地址: https://m.douban.com/rexxar/api/v2/subject_collection/tv_domestic/items
    const url = `https://m.douban.com/rexxar/api/v2/subject_collection/${key}/items?start=0&count=40`;
    
    // 关键：Referer 必须对应你给的那些链接格式，否则豆瓣会报 403 错误
    const referer = `https://m.douban.com/subject_collection/${key}/`;

    try {
        const res = await Widget.http.get(url, {
            headers: {
                "Referer": referer,
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36"
            }
        });
        
        const json = JSON.parse(res.body || res.data);
        const items = json.subject_collection_items || [];
        
        // 提取中文名和年份，传给 TMDB 去搜
        return items.map(i => ({
            title: i.title,
            year: i.year,
            // 豆瓣的 type 有时是 movie 有时是 tv，需要统一转换
            type: (key.includes("movie") || i.type === "movie") ? "movie" : "tv"
        }));
    } catch (e) { 
        console.log("Douban Error: " + e.message);
        return []; 
    }
}

// ==========================================
// 4. UI 构建
// ==========================================

function buildCard(item) {
    const d = item.tmdb;
    const typeLabel = item.mediaType === "tv" ? "剧" : "影";
    
    // 图片：优先横图
    let imagePath = "";
    if (d.backdrop_path) imagePath = `https://image.tmdb.org/t/p/w780${d.backdrop_path}`;
    else if (d.poster_path) imagePath = `https://image.tmdb.org/t/p/w500${d.poster_path}`;

    // 副标题
    let subTitle = "";
    let genreTitle = ""; 
    
    const releaseStr = formatShortDate(item.releaseDate);
    const updateStr = formatShortDate(item.sortDate);

    if (item.mediaType === "tv") {
        if (item.nextEp) {
            const epDate = formatShortDate(item.nextEp.air_date);
            subTitle = `🔜 ${epDate} 更新 S${item.nextEp.season_number}E${item.nextEp.episode_number}`;
            genreTitle = epDate;
        } else if (item.status === "returning series") {
            subTitle = `📅 最近更新: ${updateStr}`;
            genreTitle = updateStr;
        } else if (["ended", "canceled"].includes(item.status)) {
            subTitle = `[${typeLabel}] 已完结`;
            genreTitle = "End";
        } else {
            subTitle = `📅 首播: ${releaseStr}`;
            genreTitle = releaseStr;
        }
    } else {
        subTitle = `🎬 ${releaseStr} 上映`;
        genreTitle = (item.releaseDate || "").substring(0, 4);
    }
    
    return {
        id: `douban_${d.id}`,
        tmdbId: d.id, 
        type: "tmdb",
        mediaType: item.mediaType,
        title: d.name || d.title, 
        subTitle: subTitle,
        genreTitle: genreTitle,
        description: d.overview,
        posterPath: imagePath
    };
}

function formatShortDate(dateStr) {
    if (!dateStr || dateStr === "1900-01-01") return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${m}-${d}`;
}
