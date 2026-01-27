WidgetMetadata = {
  id: "gemini.platform.originals.final.v3",
  title: "流媒体·独家原创 (信息增强)",
  author: "Gemini",
  description: "Netflix/HBO/腾讯/B站 自制内容，副标题显示日期与类型",
  version: "3.1.0",
  requiredVersion: "0.0.1",
  // 1. 全局参数 (Global Params)
  globalParams: [
    {
      name: "apiKey",
      title: "TMDB API Key (必填)",
      type: "input",
      description: "用于获取数据。请在 themoviedb.org 申请。",
      value: ""
    }
  ],
  modules: [
    {
      title: "独家原创",
      functionName: "loadPlatformOriginals",
      type: "list",
      requiresWebView: false,
      params: [
        {
          name: "network",
          title: "出品平台",
          type: "enumeration",
          value: "213",
          enumOptions: [
            { title: "Netflix (网飞)", value: "213" },
            { title: "HBO (Max)", value: "49" },
            { title: "Apple TV+", value: "2552" },
            { title: "Disney+", value: "2739" },
            { title: "Amazon Prime", value: "1024" },
            { title: "Hulu", value: "453" },
            { title: "腾讯视频", value: "2007" },
            { title: "爱奇艺", value: "1330" },
            { title: "优酷", value: "1419" },
            { title: "芒果TV", value: "1631" },
            { title: "Bilibili", value: "3359" }
          ]
        },
        {
          name: "genre",
          title: "叠加类型",
          type: "enumeration",
          value: "",
          enumOptions: [
            { title: "全部", value: "" },
            { title: "剧情", value: "18" },
            { title: "科幻/奇幻", value: "10765" },
            { title: "动画", value: "16" },
            { title: "喜剧", value: "35" },
            { title: "动作/冒险", value: "10759" },
            { title: "犯罪", value: "80" },
            { title: "悬疑", value: "9648" },
            { title: "纪录片", value: "99" }
          ]
        },
        {
          name: "sortBy",
          title: "排序方式",
          type: "enumeration",
          value: "popularity.desc",
          enumOptions: [
            { title: "🔥 近期热度", value: "popularity.desc" },
            { title: "⭐ 历史评分", value: "vote_average.desc" },
            { title: "📅 最新首播", value: "first_air_date.desc" }
          ]
        }
      ]
    }
  ]
};

// TMDB TV 类型映射表
const GENRE_MAP = {
    10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 10762: "儿童", 9648: "悬疑", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀",
    10768: "战争政治", 37: "西部"
};

async function loadPlatformOriginals(params = {}) {
  // 从全局参数获取 Key
  const apiKey = params.apiKey;
  
  if (!apiKey) {
    return [{
      id: "err_no_key",
      title: "❌ 未配置 API Key",
      subTitle: "请在组件全局设置中填写 Key",
      type: "text"
    }];
  }

  const networkId = params.network || "213";
  const genreId = params.genre || "";
  const sortBy = params.sortBy || "popularity.desc";

  let url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=zh-CN&include_adult=false&include_null_first_air_dates=false&page=1`;
  url += `&with_networks=${networkId}&sort_by=${sortBy}`;
  
  if (genreId) url += `&with_genres=${genreId}`;
  if (sortBy.includes("vote_average")) url += `&vote_count.gte=200`;

  try {
    const res = await Widget.http.get(url);
    const data = res.data || res;

    if (!data.results || data.results.length === 0) {
      return [{ id: "empty", title: "该分类下无数据", type: "text" }];
    }

    return data.results.map(item => {
        // 1. 获取类型文本 (最多显示2个，用 / 分隔)
        const genreText = (item.genre_ids || [])
            .map(id => GENRE_MAP[id])
            .filter(Boolean)
            .slice(0, 2) 
            .join("/");
        
        // 2. 获取日期
        const date = item.first_air_date || "待定";
        const year = date.substring(0, 4);
        
        // 3. 组合副标题: [日期] • [类型]
        // 例如: "2024-03-21 • 科幻奇幻/剧情"
        const subTitleInfo = [date, genreText].filter(Boolean).join(" • ");

        return {
            id: String(item.id),
            tmdbId: parseInt(item.id),
            type: "tmdb",
            mediaType: "tv",
            
            title: item.name || item.original_name,
            
            // 【关键修改】副标题显示：日期和类型
            subTitle: subTitleInfo,
            
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            
            rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
            year: year,
            
            // 简介：显示评分 + 剧情
            description: `⭐ ${item.vote_average.toFixed(1)} | ${item.overview || "暂无简介"}`
        };
    });

  } catch (e) {
    return [{ id: "err_net", title: "网络错误", subTitle: e.message, type: "text" }];
  }
}
