var WidgetMetadata = {
  id: "trakt_global_fixed_ultimate",
  title: "全球剧集榜单 (最终完美版)",
  author: "Makkapakka",
  description: "Trakt数据源。修复变量丢失报错，支持分页、日期显示与自动资源匹配。",
  version: "1.0.6",
  requiredVersion: "0.0.1",
  site: "https://trakt.tv",
  
  globalParams: [
    {
      name: "client_id",
      title: "Trakt Client ID",
      type: "input",
      description: "留空则使用内置ID。",
      value: "" 
    }
  ],

  modules: [
    {
      title: "影视榜单",
      description: "浏览全球热门影视",
      requiresWebView: false,
      functionName: "loadRankings",
      type: "list",
      cacheDuration: 3600, 
      params: [
        {
          name: "region",
          title: "地区",
          type: "enumeration",
          defaultValue: "global",
          enumOptions: [
            { title: "🌍 全球热门", value: "global" },
            { title: "🇺🇸 美国 (US)", value: "us" },
            { title: "🇨🇳 中国 (CN)", value: "cn" },
            { title: "🇰🇷 韩国 (KR)", value: "kr" },
            { title: "🇯🇵 日本 (JP)", value: "jp" },
            { title: "🇭🇰 香港 (HK)", value: "hk" },
            { title: "🇬🇧 英国 (GB)", value: "gb" }
          ]
        },
        {
          name: "type",
          title: "类型",
          type: "enumeration",
          defaultValue: "shows",
          enumOptions: [
            { title: "📺 剧集 (Shows)", value: "shows" },
            { title: "🎬 电影 (Movies)", value: "movies" },
            { title: "♾️ 混合展示 (Mix)", value: "all" }
          ]
        },
        {
          name: "sort",
          title: "排序",
          type: "enumeration",
          defaultValue: "trending",
          enumOptions: [
            { title: "🔥 正在热播 (Trending)", value: "trending" },
            { title: "❤️ 最受欢迎 (Popular)", value: "popular" },
            { title: "🆕 最受期待 (Anticipated)", value: "anticipated" }
          ]
        },
        {
          name: "from",
          title: "页码",
          type: "page",
          value: "1"
        }
      ]
    }
  ]
};

// ===========================
// 配置区域
// ===========================

const DEFAULT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";
const API_BASE = "https://api.trakt.tv";

// ===========================
// 主逻辑
// ===========================

async function loadRankings(params) {
  const clientId = params.client_id || DEFAULT_CLIENT_ID;
  const region = params.region || "global";
  const type = params.type || "shows";
  const sort = params.sort || "trending";
  const page = parseInt(params.from) || 1;

  let requests = [];
  
  if (type === "all" || type === "movies") {
    requests.push(fetchTrakt(clientId, "movies", sort, region, page));
  }
  
  if (type === "all" || type === "shows") {
    requests.push(fetchTrakt(clientId, "shows", sort, region, page));
  }

  try {
    const results = await Promise.all(requests);
    let allItems = [];

    // 混合排序逻辑：交替插入，避免一屏全是电影
    if (type === "all" && results.length === 2) {
      const [movies, shows] = results;
      const maxLen = Math.max(movies.length, shows.length);
      for (let i = 0; i < maxLen; i++) {
        if (movies[i]) allItems.push(movies[i]);
        if (shows[i]) allItems.push(shows[i]);
      }
    } else {
      allItems = results.flat();
    }

    if (allItems.length === 0) {
      if (page > 1) return [{ title: "没有更多内容了", type: "text" }];
      return [{ title: "列表为空", subTitle: "请检查网络或Client ID", type: "text" }];
    }

    return allItems;

  } catch (e) {
    return [{ title: "发生错误", subTitle: String(e.message), type: "text" }];
  }
}

// ===========================
// 核心请求函数
// ===========================

async function fetchTrakt(clientId, mediaType, sort, region, page) {
  let url = `${API_BASE}/${mediaType}/${sort}?limit=20&page=${page}&extended=full`;
  if (region && region !== "global") {
    url += `&countries=${region}`;
  }

  try {
    const res = await Widget.http.get(url, {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId
      }
    });

    const data = JSON.parse(res.body || res.data);
    if (!Array.isArray(data)) return [];

    return data.map(item => {
      let subject = null;
      // 这里的逻辑兼容 popular 和 trending 两种接口结构
      const singularKey = mediaType === "movies" ? "movie" : "show";
      
      if (item[singularKey]) {
        subject = item[singularKey];
      } else if (item.ids) {
        subject = item;
      }

      // 安全检查：如果缺数据，直接跳过
      if (!subject || !subject.ids || !subject.ids.tmdb) return null;

      // === 构造日期和类型 ===
      let dateStr = "未知日期";
      const rawDate = subject.released || subject.first_aired || subject.year;
      if (rawDate) {
         dateStr = String(rawDate).substring(0, 10);
      }
      
      // ✅ 关键修复：直接在这里定义中文类型名，不再依赖外部变量
      const typeName = mediaType === "movies" ? "电影" : "剧集";
      const finalSubTitle = `[${typeName}] 📅 ${dateStr}`;

      return {
        id: `trakt_${mediaType}_${subject.ids.tmdb}`,
        type: "tmdb",
        tmdbId: parseInt(subject.ids.tmdb), // 确保是数字
        mediaType: mediaType === "movies" ? "movie" : "tv",
        title: subject.title,
        subTitle: finalSubTitle,
        description: subject.overview || "",
        posterPath: "" // 让 Forward 自动加载
      };
    }).filter(Boolean); // 过滤掉 null
    
  } catch (e) {
    // 发生网络错误时返回空数组
    console.log(e);
    return [];
  }
}
