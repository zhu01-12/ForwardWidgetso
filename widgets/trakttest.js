WidgetMetadata = {
  id: "gemini.trakt.personal.calendar",
  title: "Trakt 个人追剧日历",
  author: "Gemini",
  description: "同步你的 Trakt 账号，只显示你正在追的剧集更新 (今日/明日/未来7天)",
  version: "1.0.0",
  inputs: [
      {
          name: "traktClientId",
          title: "Trakt Client ID (可选)",
          type: "input",
          description: "不填则使用内置 ID (建议填自己的以防限流)",
      }
  ],
  modules: [
    {
      title: "我的日历",
      functionName: "loadTraktCalendar",
      type: "list",
      requiresWebView: false,
      params: [
        {
          name: "username",
          title: "Trakt 用户名 (必填)",
          type: "input",
          description: "你的 Trakt 账号 ID (不是邮箱)",
        },
        {
          name: "days",
          title: "时间范围",
          type: "enumeration",
          value: "0",
          enumOptions: [
            { title: "今日更新 (Today)", value: "0" },
            { title: "明日更新 (Tomorrow)", value: "1" },
            { title: "未来 7 天 (Next 7 Days)", value: "7" },
            { title: "未来 30 天 (Next 30 Days)", value: "30" }
          ]
        },
        {
          name: "apiKey",
          title: "TMDB API Key (必填)",
          type: "input",
          description: "用于加载海报",
        }
      ]
    }
  ]
};

async function loadTraktCalendar(params = {}) {
  // 1. 参数校验
  const username = params.username;
  const tmdbKey = params.apiKey;
  // 这是一个公开的 Trakt Client ID (示例用，建议用户申请自己的)
  const clientId = params.traktClientId || "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

  if (!username) return [{ id: "err_user", title: "❌ 请填写 Trakt 用户名", type: "text" }];
  if (!tmdbKey) return [{ id: "err_key", title: "❌ 请填写 TMDB Key", type: "text" }];

  const daysMode = params.days || "0";
  
  // 2. 计算日期
  // Trakt API 格式: /calendars/my/shows/{start_date}/{days}
  // 但 Trakt 的 "my" calendar 需要 OAuth 授权，比较复杂。
  // 为了让普通用户只需用户名就能用，我们使用 "User" calendar 接口:
  // /users/{username}/calendar/shows/{start_date}/{days}
  
  const today = new Date().toISOString().split('T')[0];
  let startDate = today;
  let daysCount = 1;

  if (daysMode === "0") {
      // 今日
      startDate = today;
      daysCount = 1;
  } else if (daysMode === "1") {
      // 明日 (Start date + 1 day)
      const tmr = new Date();
      tmr.setDate(tmr.getDate() + 1);
      startDate = tmr.toISOString().split('T')[0];
      daysCount = 1;
  } else {
      // 未来 X 天
      startDate = today;
      daysCount = parseInt(daysMode);
  }

  const url = `https://api.trakt.tv/users/${username}/calendar/shows/${startDate}/${daysCount}`;
  
  console.log(`[Trakt] Fetching: ${url}`);

  try {
    const res = await Widget.http.get(url, {
        headers: {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": clientId
        }
    });

    const data = res.data || res;

    // 检查是否为空或出错
    if (!Array.isArray(data)) {
        return [{ 
            id: "err_trakt", 
            title: "Trakt 访问失败", 
            description: "用户名错误或隐私设置未公开", 
            type: "text" 
        }];
    }

    if (data.length === 0) {
        return [{ 
            id: "empty", 
            title: "📅 无更新", 
            description: "你的待看列表在该时段无更新", 
            type: "text" 
        }];
    }

    // 3. 并发补充 TMDB 图片
    // Trakt 返回的数据包含 tmdb_id，我们直接用这个 ID 去 TMDB 拿图片
    const promises = data.map(async (item) => {
        const show = item.show;
        const episode = item.episode;
        const tmdbId = show.ids.tmdb; // Trakt 直接给了 TMDB ID，太棒了
        
        // 构造基础信息
        let resultItem = {
            id: String(tmdbId),
            tmdbId: tmdbId,
            type: "tmdb",
            mediaType: "tv",
            title: `${episode.season}x${episode.number} | ${show.title}`,
            description: episode.title || `第 ${episode.number} 集`,
            year: (show.year || "").toString(),
            // 默认无图，稍后补全
            posterPath: "",
            backdropPath: ""
        };

        // 去 TMDB 拿高清图
        if (tmdbKey && tmdbId) {
            try {
                const tmdbUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbKey}&language=zh-CN`;
                const tmdbRes = await Widget.http.get(tmdbUrl);
                const tmdbData = tmdbRes.data || tmdbRes;
                
                if (tmdbData) {
                    // 优先显示中文名
                    resultItem.title = `${episode.season}x${episode.number} | ${tmdbData.name || show.title}`;
                    resultItem.posterPath = tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : "";
                    resultItem.backdropPath = tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/w780${tmdbData.backdrop_path}` : "";
                    resultItem.rating = tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : "0.0";
                }
            } catch (e) {
                // 图片加载失败降级处理，不影响列表显示
                console.log("TMDB Image load failed for " + show.title);
            }
        }
        
        return resultItem;
    });

    return await Promise.all(promises);

  } catch (e) {
      return [{ id: "err_net", title: "网络错误", description: e.message, type: "text" }];
  }
}
