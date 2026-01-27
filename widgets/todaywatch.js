WidgetMetadata = {
  id: "whattowatch",
  title: "今天看什么",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "剧荒拯救者，随机或根据观看习惯推剧",
  version: "1.1.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "今天看什么",
      functionName: "loadRecommendations",
      type: "list",
      requiresWebView: false,
      params: [
        // 1. TMDB Key (必填，视觉核心)
        {
          name: "apiKey",
          title: "TMDB API Key (必填)",
          type: "input",
          description: "必须填写",
        },
        // 2. Trakt 用户名 (可选，逻辑核心)
        {
          name: "traktUser",
          title: "Trakt 用户名 (可选)",
          type: "input",
          description: "填入则根据口味推荐，不填则完全随机",
        },
        // 3. 类型选择
        {
          name: "mediaType",
          title: "想看什么",
          type: "enumeration",
          value: "tv",
          enumOptions: [
            { title: "电视剧 (TV Shows)", value: "tv" },
            { title: "电影 (Movies)", value: "movie" }
          ]
        }
      ]
    }
  ]
};

async function loadRecommendations(params = {}) {
  const apiKey = params.apiKey;
  const traktUser = params.traktUser;
  const mediaType = params.mediaType || "tv";

  // 0. 基础检查
  if (!apiKey) {
    return [{
      id: "err_no_key",
      title: "❌ 请填写 API Key",
      subTitle: "点击组件进入设置填写",
      type: "text"
    }];
  }

  let results = [];
  let sourceInfo = "";

  // 1. 分流逻辑
  if (traktUser) {
    // === 模式 A: 个性化推荐 ===
    console.log(`[Mode] Trakt Personalized: ${traktUser}`);
    const historyItem = await fetchLastWatched(traktUser, mediaType);
    
    if (historyItem) {
      // 如果找到了观看记录，就根据这个记录去 TMDB 找相似
      sourceInfo = `因为你看过: ${historyItem.title}`;
      results = await fetchTmdbRecommendations(historyItem.tmdbId, mediaType, apiKey);
    } else {
      // 没找到记录（可能是新号，或者隐私设置）
      sourceInfo = "未找到Trakt记录，已切换至随机模式";
      results = await fetchRandomTmdb(mediaType, apiKey);
    }
  } else {
    // === 模式 B: 完全随机 ===
    console.log(`[Mode] Random Discovery`);
    sourceInfo = "🎲 完全随机模式";
    results = await fetchRandomTmdb(mediaType, apiKey);
  }

  // 2. 结果处理
  if (!results || results.length === 0) {
    return [{
      id: "err_empty",
      title: "🤔 没找到推荐",
      subTitle: "请重试或检查网络",
      type: "text"
    }];
  }

  // 3. 格式化输出
  return results.slice(0, 15).map(item => {
    return {
      id: String(item.id),
      tmdbId: parseInt(item.id),
      type: "tmdb",
      mediaType: mediaType,
      
      title: item.name || item.title,
      // 如果有个性化来源，显示在第一条，其他的显示评分
      subTitle: item.overview || "",
      
      posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
      backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
      
      rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
      year: (item.first_air_date || item.release_date || "").substring(0, 4),
      
      // 在简介上方显示推荐来源
      description: sourceInfo
    };
  });
}

// ==========================================
// 工具 A: 获取 Trakt 最后观看记录
// ==========================================
async function fetchLastWatched(username, type) {
  // Trakt Client ID (可以使用公共的，或者之前的)
  const clientId = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";
  // type 转换: tmdb "tv" -> trakt "shows", tmdb "movie" -> trakt "movies"
  const traktType = type === "tv" ? "shows" : "movies";
  
  const url = `https://api.trakt.tv/users/${username}/history/${traktType}?limit=1`;
  
  try {
    const res = await Widget.http.get(url, {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId
      }
    });
    
    const data = res.data || res;
    if (data && data.length > 0) {
      const item = data[0]; // 最近一次观看
      const work = item.show || item.movie;
      return {
        tmdbId: work.ids.tmdb,
        title: work.title
      };
    }
  } catch (e) {
    console.log("Trakt Error: " + e.message);
  }
  return null;
}

// ==========================================
// 工具 B: TMDB 根据 ID 推荐相似 (Recommendation)
// ==========================================
async function fetchTmdbRecommendations(seedId, mediaType, apiKey) {
  if (!seedId) return [];
  // 调用 Recommendations 接口
  const url = `https://api.themoviedb.org/3/${mediaType}/${seedId}/recommendations?api_key=${apiKey}&language=zh-CN&page=1`;
  
  try {
    const res = await Widget.http.get(url);
    const data = res.data || res;
    return data.results || [];
  } catch (e) {
    return [];
  }
}

// ==========================================
// 工具 C: TMDB 随机发现 (Random Discovery)
// ==========================================
async function fetchRandomTmdb(mediaType, apiKey) {
  // 1. 随机页码 (1-20页)，保证每次看到的不一样
  const randomPage = Math.floor(Math.random() * 20) + 1;
  
  const url = `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${apiKey}&language=zh-CN&sort_by=popularity.desc&include_adult=false&vote_count.gte=100&page=${randomPage}`;
  
  try {
    const res = await Widget.http.get(url);
    const data = res.data || res;
    let items = data.results || [];
    
    // 2. 再次打乱当前页的顺序 (洗牌算法)
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    
    return items;
  } catch (e) {
    return [];
  }
}
