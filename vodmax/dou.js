// ============================================
// 豆瓣同步 & 追更 (Forward 规范修复版)
// ============================================

WidgetMetadata = {
  // 使用唯一ID，避免冲突
  id: "douban_sync_strict_v1",
  title: "豆瓣同步 & 追更",
  author: "Gemini",
  description: "基于豆瓣数据，支持按TMDB剧集更新时间排序。",
  // 核心版本号
  version: "1.0.0",
  // 必须声明模块
  modules: [
    {
      title: "豆瓣片单",
      type: "list", // 【关键修复】必须明确指定类型为 list
      functionName: "loadDoubanList", // 函数名必须与下方定义完全一致
      requiresWebView: false, 
      cacheDuration: 3600,
      params: [
        {
          name: "user_id",
          title: "豆瓣 ID (必填)",
          type: "input",
          defaultValue: "", 
          description: "数字ID或个性域名"
        },
        {
          name: "status",
          title: "筛选状态",
          type: "enumeration",
          defaultValue: "mark",
          enumOptions: [
            { title: "想看 (Mark)", value: "mark" },
            { title: "在看 (Doing)", value: "doing" },
            { title: "看过 (Done)", value: "done" }
          ]
        },
        {
          name: "sort_mode",
          title: "排序模式",
          type: "enumeration",
          defaultValue: "default",
          enumOptions: [
            { title: "📌 默认 (豆瓣原序)", value: "default" },
            { title: "📅 按更新时间 (追更)", value: "update" },
            { title: "🆕 按上映年份", value: "release" }
          ]
        },
        {
            name: "page",
            title: "页码",
            type: "page"
        }
      ]
    }
  ]
};

// ============================================
// 核心逻辑
// ============================================

// 提取 Headers 常量，模拟真实用户
const DB_HEADERS = {
  "Referer": "https://m.douban.com/movie",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
};

async function loadDoubanList(params) {
  // 1. 安全检查：如果没有参数，防止崩溃
  const userId = params.user_id;
  const status = params.status || "mark";
  const sortMode = params.sort_mode || "default";
  const page = params.page || 1;

  // 2. 如果未填写 ID，返回引导卡片 (不要抛出 Error)
  if (!userId) {
    return [{
      id: "guide_card",
      type: "text",
      title: "请配置豆瓣 ID",
      subTitle: "点击右上角编辑组件参数"
    }];
  }

  // 3. 构造请求
  // 注意：params 必须和原脚本保持一致 (ck=, for_mobile=1)
  const count = 15;
  const start = (page - 1) * count;
  const url = `https://m.douban.com/rexxar/api/v2/user/${userId}/interests?type=${status}&count=${count}&order_by=time&start=${start}&ck=&for_mobile=1`;

  try {
    // 发起请求
    const res = await Widget.http.get(url, { headers: DB_HEADERS });
    
    // 解析数据 (处理可能的 String 或 Object 返回)
    let data = res.data || res.body;
    if (typeof data === "string") {
        try { data = JSON.parse(data); } catch(e) {}
    }

    // 豆瓣错误处理
    if (!data || data.msg === "user_not_found") {
        return [{ id: "err_user", type: "text", title: "用户不存在", subTitle: "请检查ID是否填写正确" }];
    }
    
    const interests = data.interests || [];
    if (interests.length === 0) {
        return [{ id: "empty", type: "text", title: "列表为空", subTitle: "没有更多数据了" }];
    }

    // 4. 初步处理数据 (映射为标准对象)
    let items = interests.map(i => {
        const subject = i.subject || {};
        // 封面图处理
        const poster = subject.pic?.large || subject.pic?.normal || subject.cover_url || "";
        
        return {
            doubanId: subject.id,
            title: subject.title,
            original_title: subject.original_title,
            year: subject.year,
            rating: subject.rating?.value,
            pic: poster,
            type: subject.type === "movie" ? "movie" : "tv",
            comment: i.comment,
            // 默认排序字段
            sortDate: "1900-01-01",
            displayInfo: ""
        };
    });

    // 5. 如果开启了排序，进行 TMDB 增强
    if (sortMode !== "default") {
        items = await enrichItems(items, sortMode);
        
        // 执行排序
        items.sort((a, b) => {
            if (a.sortDate === b.sortDate) return 0;
            // 倒序：时间晚的在前面
            return a.sortDate < b.sortDate ? 1 : -1;
        });
    }

    // 6. 返回最终卡片数组
    return items.map(item => buildCard(item, sortMode));

  } catch (e) {
    // 最后的防线：发生网络错误时不崩坏，返回错误卡片
    console.error(e);
    return [{
        id: "error_net",
        type: "text",
        title: "请求失败",
        subTitle: e.message || "请检查网络"
    }];
  }
}

// ============================================
// 辅助功能：数据增强
// ============================================

async function enrichItems(items, sortMode) {
    // 使用 Promise.all 并发处理，必须捕获内部错误
    const tasks = items.map(async (item) => {
        try {
            // A. 搜索 TMDB
            const searchRes = await Widget.tmdb.search(item.title, item.type, { language: "zh-CN" });
            const results = searchRes.results || [];
            
            // B. 简单匹配 (年份校对)
            let match = null;
            if (results.length > 0) {
                const targetYear = parseInt(item.year);
                match = results.find(r => {
                    const rDate = r.first_air_date || r.release_date || "1900";
                    const rYear = parseInt(rDate.substring(0, 4));
                    return Math.abs(rYear - targetYear) <= 2;
                });
                if (!match) match = results[0];
            }

            if (match) {
                item.tmdbId = match.id;
                
                // C. 获取具体日期
                if (item.type === "tv" && sortMode === "update") {
                    // 剧集追更模式
                    const detail = await Widget.tmdb.get(`/tv/${match.id}`, { params: { language: "zh-CN" } });
                    const nextEp = detail.next_episode_to_air;
                    const lastEp = detail.last_episode_to_air;

                    if (nextEp) {
                        item.sortDate = nextEp.air_date;
                        item.displayInfo = `🔜 ${formatDate(nextEp.air_date)} S${nextEp.season_number}E${nextEp.episode_number}`;
                    } else if (lastEp) {
                        item.sortDate = lastEp.air_date;
                        item.displayInfo = `🔥 ${formatDate(lastEp.air_date)} S${lastEp.season_number}E${lastEp.episode_number}`;
                    } else {
                        item.sortDate = detail.first_air_date || "1900-01-01";
                    }
                } else {
                    // 电影或上映模式
                    item.sortDate = match.release_date || match.first_air_date || "1900-01-01";
                    item.displayInfo = sortMode === "release" ? `📅 ${item.sortDate}` : "";
                }
            }
        } catch (ignored) {
            // 单个条目失败不影响整体
        }
        return item;
    });

    return Promise.all(tasks);
}

// ============================================
// UI 构建
// ============================================

function buildCard(item, sortMode) {
    let sub = "";
    let genre = "";

    // 根据模式决定显示内容
    if (sortMode !== "default" && item.displayInfo) {
        sub = item.displayInfo;
        genre = item.rating ? `⭐${item.rating}` : item.year;
    } else {
        // 默认模式
        sub = item.comment ? `💬 ${item.comment}` : (item.original_title || "");
        genre = item.rating ? `豆瓣 ${item.rating}` : item.year;
    }

    return {
        id: String(item.doubanId), // 必须是字符串
        
        // 关键跳转逻辑：
        // 有 tmdbId -> type="tmdb" (App原生详情)
        // 无 tmdbId -> type="web" (跳转豆瓣网页)
        type: item.tmdbId ? "tmdb" : "web",
        tmdbId: item.tmdbId || null,
        mediaType: item.type,
        
        title: item.title,
        subTitle: sub,
        genreTitle: String(genre),
        
        posterPath: item.pic,
        description: item.original_title || "",
        
        url: `https://m.douban.com/${item.type}/${item.doubanId}/`
    };
}

// 日期格式化 (2024-02-01 -> 02-01)
function formatDate(str) {
    if (!str) return "";
    return str.substring(5);
}
