WidgetMetadata = {
  id: "gemini.platform.originals.v2.2",
  title: "流媒体·独家原创 (Trakt时间版)",
  author: "Gemini & Makkapakka",
  description: "v2.2: 列表源自TMDB，时间源自Trakt。修复更新日期不准问题；支持腾讯/B站等平台及追更排序。",
  version: "2.2.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "独家原创 & 追更日历",
      functionName: "loadPlatformOriginals",
      type: "list",
      requiresWebView: false,
      params: [
        // 1. 平台选择
        {
          name: "network",
          title: "出品平台",
          type: "enumeration",
          value: "213", // Netflix
          enumOptions: [
            // --- 国际巨头 ---
            { title: "Netflix (网飞)", value: "213" },
            { title: "HBO (Max)", value: "49" },
            { title: "Apple TV+", value: "2552" },
            { title: "Disney+", value: "2739" },
            { title: "Amazon Prime", value: "1024" },
            { title: "Hulu", value: "453" },
            { title: "Peacock", value: "3353" },
            { title: "Paramount+", value: "4330" },
            // --- 国内巨头 ---
            { title: "腾讯视频", value: "2007" },
            { title: "爱奇艺", value: "1330" },
            { title: "Bilibili (B站)", value: "1605" },
            { title: "优酷视频", value: "1419" },
            { title: "芒果TV", value: "1631" },
            { title: "TVING (韩)", value: "4096" }
          ],
        },
        // 2. 内容类型
        {
          name: "contentType",
          title: "内容类型",
          type: "enumeration",
          value: "tv",
          enumOptions: [
            { title: "📺 剧集 (默认)", value: "tv" },
            { title: "🎬 电影", value: "movie" },
            { title: "🌸 动漫/动画", value: "anime" },
            { title: "🎤 综艺/真人秀", value: "variety" }
          ]
        },
        // 3. 排序与功能
        {
          name: "sortBy",
          title: "排序与功能",
          type: "enumeration",
          value: "popularity.desc",
          enumOptions: [
            { title: "🔥 综合热度", value: "popularity.desc" },
            { title: "⭐ 最高评分", value: "vote_average.desc" },
            { title: "🆕 最新首播", value: "first_air_date.desc" },
            { title: "📅 按更新时间 (Trakt精准)", value: "next_episode" },
            { title: "📆 今日播出 (每日榜单)", value: "daily_airing" }
          ],
        },
        // 4. 页码
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ],
    },
  ],
};

// ==========================================
// 常量定义
// ==========================================
const TRAKT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";
const TRAKT_API_BASE = "https://api.trakt.tv";

async function loadPlatformOriginals(params) {
  const networkId = params.network || "213";
  const contentType = params.contentType || "tv";
  const sortBy = params.sortBy || "popularity.desc";
  const page = params.page || 1;

  // === 1. 构建 TMDB 查询参数 (用于获取基础列表) ===
  let endpoint = "/discover/tv";
  let queryParams = {
      with_networks: networkId,
      language: "zh-CN",
      include_null_first_air_dates: false,
      page: page
  };

  if (contentType === "movie") {
    endpoint = "/discover/movie";
    if (sortBy === "first_air_date.desc") queryParams.sort_by = "release_date.desc";
    else if (sortBy === "next_episode" || sortBy === "daily_airing") queryParams.sort_by = "popularity.desc"; 
    else queryParams.sort_by = sortBy;
    
  } else {
    // TV 类 (剧集/动漫/综艺)
    if (contentType === "anime") queryParams.with_genres = "16"; 
    else if (contentType === "variety") queryParams.with_genres = "10764|10767"; 

    // 排序预处理
    if (sortBy === "daily_airing") {
        // 每日更新：先用 TMDB 粗筛今天的，后续用 Trakt 验证
        const today = new Date();
        const dateStr = today.toISOString().split("T")[0]; 
        queryParams["air_date.gte"] = dateStr;
        queryParams["air_date.lte"] = dateStr;
        queryParams.sort_by = "popularity.desc";
    } else if (sortBy === "next_episode") {
        // 追更模式：先按热度拿数据，再用 Trakt 排时间
        queryParams.sort_by = "popularity.desc";
    } else {
        if (sortBy.includes("vote_average")) queryParams["vote_count.gte"] = 100;
        queryParams.sort_by = sortBy;
    }
  }

  try {
    // 1. 获取基础列表 (TMDB)
    const res = await Widget.tmdb.get(endpoint, { params: queryParams });
    const items = res?.results || [];

    if (items.length === 0) {
      return page === 1 ? [{ title: "暂无数据", subTitle: "尝试切换类型或平台", type: "text" }] : [];
    }

    // === 2. Trakt 数据增强 (核心修改) ===
    
    // 只有 TV 类且需要时间排序时，才请求 Trakt
    const needTrakt = (contentType !== "movie" && (sortBy === "next_episode" || sortBy === "daily_airing"));
    // 限制处理数量，Trakt API 比 TMDB 严格，避免超时
    const processCount = needTrakt ? 12 : 20;

    const enrichedItems = await Promise.all(items.slice(0, processCount).map(async (item) => {
        let traktEp = null;
        let sortDate = "1900-01-01";

        // 默认使用 TMDB 的首播时间作为保底
        sortDate = item.first_air_date || item.release_date || "2099-01-01";

        if (needTrakt) {
             // 去 Trakt 查时间
             const tData = await getTraktEpisodeInfo(item.id);
             if (tData) {
                 traktEp = tData;
                 sortDate = tData.air_date; // 使用 Trakt 的精准时间
             }
        }

        return {
            ...item,
            _traktEp: traktEp,
            _sortDate: sortDate
        };
    }));

    // === 3. 本地排序 (基于 Trakt 时间) ===
    let finalItems = enrichedItems;
    
    if (sortBy === "next_episode" && contentType !== "movie") {
        finalItems.sort((a, b) => {
            const dateA = new Date(a._sortDate).getTime();
            const dateB = new Date(b._sortDate).getTime();
            
            // 逻辑：有待播集的排前面，且时间越近越前
            // 如果都有 Next Ep
            if (a._traktEp?.type === 'next' && b._traktEp?.type === 'next') return dateA - dateB;
            
            // 如果一个是 Next，一个是 Last (已播)
            if (a._traktEp?.type === 'next' && b._traktEp?.type !== 'next') return -1;
            if (a._traktEp?.type !== 'next' && b._traktEp?.type === 'next') return 1;
            
            // 如果都是已播，按时间倒序 (刚播完的在前)
            return dateB - dateA;
        });
    }

    return finalItems.map(item => buildCard(item, contentType, sortBy));

  } catch (e) {
    return [{ title: "请求失败", subTitle: e.message, type: "text" }];
  }
}

// === Trakt API 辅助函数 ===
async function getTraktEpisodeInfo(tmdbId) {
    try {
        const headers = {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": TRAKT_CLIENT_ID
        };

        // 1. 尝试查下一集 (Next Episode) - 追更最重要
        let nextRes = null;
        try {
            nextRes = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}/next_episode?extended=full`, { headers });
        } catch(e) {}

        if (nextRes && nextRes.status === 200) {
            const data = JSON.parse(nextRes.body || nextRes.data);
            return { ...data, type: 'next', air_date: data.first_aired };
        }

        // 2. 如果没有下一集，查上一集 (Last Episode) - 看看最近更了啥
        let lastRes = null;
        try {
            lastRes = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}/last_episode?extended=full`, { headers });
        } catch(e) {}

        if (lastRes && lastRes.status === 200) {
            const data = JSON.parse(lastRes.body || lastRes.data);
            return { ...data, type: 'last', air_date: data.first_aired };
        }

        return null;
    } catch (e) {
        return null;
    }
}

function buildCard(item, contentType, sortBy) {
    const isMovie = contentType === "movie";
    const typeLabel = isMovie ? "影" : (contentType === "anime" ? "漫" : (contentType === "variety" ? "综" : "剧"));
    
    // 图片
    let imagePath = "";
    if (item.backdrop_path) imagePath = `https://image.tmdb.org/t/p/w780${item.backdrop_path}`;
    else if (item.poster_path) imagePath = `https://image.tmdb.org/t/p/w500${item.poster_path}`;

    // 格式化日期 (MM-DD)
    const formatDate = (str) => {
        if (!str) return "";
        const date = new Date(str);
        if (isNaN(date.getTime())) return str;
        return `${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
    };

    let subTitle = "";
    let genreTitle = "";

    // 优先展示 Trakt 数据
    if (!isMovie && (sortBy === "next_episode" || sortBy === "daily_airing") && item._traktEp) {
        const ep = item._traktEp;
        const dateStr = formatDate(ep.air_date);
        
        if (ep.type === 'next') {
            subTitle = `🔜 ${dateStr} 更新 S${ep.season}E${ep.number}`;
            genreTitle = dateStr;
        } else {
            const prefix = sortBy === "daily_airing" ? "🔥" : "📅";
            subTitle = `${prefix} ${dateStr} 更新 S${ep.season}E${ep.number}`;
            genreTitle = dateStr;
        }
    } else {
        // 默认 / 电影 / Trakt没查到
        const year = (item.release_date || item.first_air_date || "").substring(0, 4);
        const rating = item.vote_average ? `⭐${item.vote_average.toFixed(1)}` : "";
        
        if (isMovie) {
            subTitle = `🎬 ${year} • ${rating}`;
        } else {
            subTitle = `[${typeLabel}] ${year} • ${rating}`;
        }
        genreTitle = year;
    }

    return {
        id: String(item.id),
        tmdbId: parseInt(item.id),
        type: "tmdb",
        mediaType: isMovie ? "movie" : "tv",
        title: item.name || item.title || item.original_name,
        subTitle: subTitle,
        genreTitle: genreTitle,
        description: item.overview || "暂无简介",
        posterPath: imagePath
    };
}
