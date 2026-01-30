WidgetMetadata = {
  id: "trakt_global_rankings",
  title: "全球剧集榜单 (Trakt)",
  author: "Makkapakka",
  description: "基于 Trakt 大数据。包含美/国/韩/日/西/港台/英/全球等区域。支持电影/剧集分类及多种排序。",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  site: "https://trakt.tv",
  
  // 全局参数：用户可配置 Client ID
  globalParams: [
    {
      name: "client_id",
      title: "Trakt Client ID",
      type: "input",
      description: "留空则使用内置 Key。如有私有 Key 建议填入以防限流。",
      value: "" 
    }
  ],

  modules: [
    {
      title: "影视榜单",
      description: "查看各国热门影视",
      requiresWebView: false,
      functionName: "loadRankings",
      type: "list",
      cacheDuration: 3600, // 缓存1小时
      params: [
        {
          name: "region",
          title: "地区",
          type: "enumeration",
          defaultValue: "global",
          enumOptions: [
            { title: "🌍 全球热门", value: "global" },
            { title: "🇺🇸 美剧/大片", value: "us" },
            { title: "🇨🇳 国产剧", value: "cn" },
            { title: "🇰🇷 韩剧/韩影", value: "kr" },
            { title: "🇯🇵 日剧/日漫", value: "jp" },
            { title: "🇭🇰 港台剧", value: "hk,tw" },
            { title: "🇬🇧 英剧", value: "gb" },
            { title: "🇪🇸 西班牙剧", value: "es" },
            { title: "🇮🇳 印度影视", value: "in" }
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
            { title: "♾️ 混合展示", value: "all" }
          ]
        },
        {
          name: "sort",
          title: "排序方式",
          type: "enumeration",
          defaultValue: "trending",
          enumOptions: [
            { title: "🔥 正在热播 (Trending)", value: "trending" },
            { title: "❤️ 最受欢迎 (Popular)", value: "popular" },
            { title: "🆕 近期更新/关注 (Anticipated)", value: "anticipated" },
            { title: "👁️ 观看最多 (Played)", value: "played" }
          ]
        }
      ]
    }
  ]
};

// ===========================
// 常量与配置
// ===========================

const DEFAULT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";
const API_BASE = "https://api.trakt.tv";

// ===========================
// 主逻辑
// ===========================

async function loadRankings(params) {
  // 1. 获取 ID (优先用户输入，否则内置)
  // 注意：globalParams 在 params 中通常以 key 形式存在，或者在 config 中
  const clientId = params.client_id || DEFAULT_CLIENT_ID;
  
  const region = params.region || "global";
  const type = params.type || "shows";
  const sort = params.sort || "trending";

  // 2. 准备请求列表
  // 如果是 "all" (混合)，我们需要请求 movies 和 shows 然后合并
  let requests = [];
  
  if (type === "all" || type === "movies") {
    requests.push(fetchTrakt(clientId, "movies", sort, region));
  }
  
  if (type === "all" || type === "shows") {
    requests.push(fetchTrakt(clientId, "shows", sort, region));
  }

  try {
    const results = await Promise.all(requests);
    let allItems = results.flat();

    // 3. 如果是混合模式，需要手动再次排序
    if (type === "all") {
      // 简单的根据 watchers 或 原始顺序混排
      // 这里为了体验，我们采用交替混排或者按照原始热度值(如果有)
      // 简化处理：直接截取合并
      allItems = allItems.sort(() => Math.random() - 0.5); // 稍微打乱，或者保留原始权重
    }

    if (allItems.length === 0) {
      return [{ title: "未获取到数据", subTitle: "请检查网络或更换地区", type: "text" }];
    }

    return allItems;

  } catch (e) {
    return [
      { 
        title: "请求失败", 
        subTitle: e.message, 
        description: "可能原因：Client ID 失效或网络连接问题。",
        type: "text" 
      }
    ];
  }
}

// ===========================
// 网络请求与处理
// ===========================

async function fetchTrakt(clientId, type, sort, region) {
  // 构造 URL
  // 基础模式: https://api.trakt.tv/{type}/{sort}?countries={region}
  
  let endpoint = `/${type}/${sort}`;
  
  // 针对不同 Sort 修正 Endpoint
  // Trakt 的 sort 参数并不完全统一
  // trending: 返回带 watchers 信息的列表
  // popular: 返回简略列表
  // played: 类似 trending
  
  let queryParams = `?limit=40&extended=full`; // 获取40条，full以获取详情
  
  if (region && region !== "global") {
    queryParams += `&countries=${region}`;
  }

  const url = `${API_BASE}${endpoint}${queryParams}`;

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
    // Trakt 返回的数据结构在不同 endpoint 下不一样
    // trending/anticipated/played: { watchers: 123, movie: { ... } } 或 { show: { ... } }
    // popular: { title: "...", ids: ... } (直接就是对象)
    
    let subject = null;
    let extraInfo = "";

    if (item.movie) {
      subject = item.movie;
      extraInfo = item.watchers ? `🔥 ${item.watchers} 人在看` : "🎬 电影";
    } else if (item.show) {
      subject = item.show;
      extraInfo = item.watchers ? `🔥 ${item.watchers} 人在看` : "📺 剧集";
    } else if (item.title) {
      // popular 接口直接返回对象
      subject = item;
      extraInfo = type === "movies" ? "🎬 电影" : "📺 剧集";
    }

    if (!subject) return null;

    // 获取 TMDB ID
    const tmdbId = subject.ids?.tmdb;
    const imdbId = subject.ids?.imdb;
    const year = subject.year || "";
    const title = subject.title;
    
    // 构造 Forward 卡片
    // 核心技巧：使用 'tmdb' 类型，Forward 会自动补全海报和详情页！
    if (tmdbId) {
      return {
        id: `trakt_${subject.ids.slug || tmdbId}`,
        type: "tmdb", // 👈 关键：利用 Forward 内置能力
        tmdbId: tmdbId,
        mediaType: type === "shows" ? "tv" : "movie", // 告诉 TMDB 是剧还是电影
        
        // 兜底信息（万一 TMDB 没加载出来显示这些）
        title: title,
        subTitle: `${year} • ${extraInfo}`,
        description: subject.overview,
        
        // 自定义 Header 方便调试
        headers: {
            "trakt-id": subject.ids.trakt
        }
      };
    } else {
        // 如果没有 TMDB ID，回退到普通卡片（极少见）
        return {
            title: title,
            subTitle: "暂无详细数据",
            type: "text"
        };
    }
  }).filter(Boolean); // 过滤空值
}
