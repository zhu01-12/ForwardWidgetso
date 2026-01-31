// 豆瓣全能版 (增强排序 + 完整功能)
// v3.0: 找回丢失的片单/推荐/影人模块，集成Trakt时间排序
WidgetMetadata = {
  id: "douban_ultimate_pro",
  title: "豆瓣·我的影视 & 推荐聚合",
  author: "Gemini Remake",
  description: "集合豆瓣我看(支持更新排序)、个性推荐、精选豆列、分类找片及影人查询。",
  modules: [
    // 模块1: 豆瓣我看 (本次修改的核心，带排序)
    {
      title: "👀 豆瓣我看 (带时间排序)",
      requiresWebView: false,
      functionName: "loadInterestItems",
      cacheDuration: 3600,
      params: [
        {
          name: "user_id",
          title: "用户ID",
          type: "input",
          description: "必填：数字ID或个性域名",
        },
        {
          name: "status",
          title: "状态",
          type: "enumeration",
          defaultValue: "mark",
          enumOptions: [
            { title: "想看 (Mark)", value: "mark" },
            { title: "在看 (Doing)", value: "doing" },
            { title: "看过 (Done)", value: "done" }
          ],
        },
        // --- 新增的排序功能 ---
        {
          name: "sort_mode",
          title: "排序模式",
          type: "enumeration",
          defaultValue: "default",
          enumOptions: [
            { title: "🔥 默认顺序 (豆瓣原序)", value: "default" },
            { title: "📅 按更新/下一集 (Trakt)", value: "update" },
            { title: "🆕 按上映年份 (Trakt)", value: "release" }
          ]
        },
        { name: "page", title: "页码", type: "page" }
      ],
    },
    // 模块2: 个性化推荐 (您原本的功能)
    {
      title: "✨ 个性化推荐",
      requiresWebView: false,
      functionName: "loadSuggestionItems",
      cacheDuration: 43200,
      params: [
        {
          name: "cookie",
          title: "用户Cookie",
          type: "input",
          description: "必填：m.douban.com 获取",
        }
      ],
    },
    // 模块3: 豆瓣片单 (Doulist)
    {
      title: "📜 精选豆列 (豆瓣片单)",
      requiresWebView: false,
      functionName: "loadDoulistItems",
      type: "list",
      params: [
        {
          name: "doulist_id",
          title: "豆列ID",
          type: "input",
          description: "例如: https://www.douban.com/doulist/123456/ 中的 123456"
        },
        { name: "page", title: "页码", type: "page" }
      ]
    },
    // 模块4: 分类找片 (电影/剧集推荐)
    {
      title: "🎬 电影/剧集推荐 (分类)",
      requiresWebView: false,
      functionName: "loadExploreItems",
      type: "list",
      params: [
        {
          name: "type",
          title: "类型",
          type: "enumeration",
          value: "movie",
          enumOptions: [
            { title: "电影", value: "movie" },
            { title: "电视剧", value: "tv" }
          ]
        },
        {
          name: "tag",
          title: "标签/风格",
          type: "input",
          defaultValue: "热门",
          description: "例如：热门, 冷门佳片, 科幻, 悬疑, 华语"
        }
      ]
    },
    // 模块5: 影人查询
    {
      title: "🧑‍🎤 影人作品查询",
      requiresWebView: false,
      functionName: "loadCelebrityWorks",
      type: "list",
      params: [
        {
          name: "actor_id",
          title: "影人ID",
          type: "input",
          description: "豆瓣影人页面的数字ID"
        },
        {
          name: "sort",
          title: "排序",
          type: "enumeration",
          value: "time",
          enumOptions: [
            { title: "按时间", value: "time" },
            { title: "按热度", value: "vote" }
          ]
        }
      ]
    }
  ],
};

// ==========================================
// 公共常量
// ==========================================
const TRAKT_CLIENT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";
const TRAKT_API_BASE = "https://api.trakt.tv";
const DOUBAN_HEADERS = {
  "Referer": "https://m.douban.com/movie",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
};

// ==========================================
// 1. 豆瓣我看 (集成 Trakt 排序)
// ==========================================
async function loadInterestItems(params) {
  const { user_id, status = "mark", page = 1, sort_mode = "default" } = params;
  if (!user_id) return [{ title: "需填写用户ID", subTitle: "配置中未填写", type: "text" }];

  const start = (page - 1) * 15;
  const url = `https://m.douban.com/rexxar/api/v2/user/${user_id}/interests?type=${status}&count=15&order_by=time&start=${start}&ck=&for_mobile=1`;
  
  try {
    const res = await Widget.http.get(url, { headers: DOUBAN_HEADERS });
    const data = JSON.parse(res.body || res.data);
    const interests = data.interests || [];

    if (interests.length === 0) return [{ title: "列表为空", subTitle: "没有更多数据了", type: "text" }];

    // 预处理
    let items = interests.map(i => ({
      doubanId: i.subject.id,
      title: i.subject.title,
      original_title: i.subject.original_title,
      year: i.subject.year,
      pic: i.subject.pic?.large || i.subject.pic?.normal || "",
      rating: i.subject.rating?.value || "0.0",
      type: i.subject.type === "movie" ? "movie" : "tv",
      comment: i.comment,
      raw: i.subject
    }));

    // 排序逻辑
    if (sort_mode !== "default") {
      items = await enrichWithTraktData(items);
      if (sort_mode === "update") {
        items.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
      } else if (sort_mode === "release") {
        items.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
      }
    }

    return items.map(item => buildProCard(item, sort_mode));
  } catch (e) {
    return [{ title: "获取失败", subTitle: e.message, type: "text" }];
  }
}

// Trakt 数据增强 (仅用于模块1)
async function enrichWithTraktData(items) {
  return await Promise.all(items.map(async (item) => {
    let sortDate = "1900-01-01";
    let releaseDate = "1900-01-01";
    let nextEpStr = null;

    try {
      const searchRes = await Widget.tmdb.search(item.title, item.type, { language: "zh-CN" });
      const results = searchRes.results || [];
      let bestMatch = results.find(r => Math.abs(parseInt((r.first_air_date||r.release_date||"0").substring(0,4)) - parseInt(item.year)) <= 2) || results[0];

      if (bestMatch) {
        item.tmdbId = bestMatch.id;
        if (item.type === "tv") {
          const tData = await getTraktEpisodeInfo(bestMatch.id);
          if (tData) {
            sortDate = tData.air_date;
            releaseDate = bestMatch.first_air_date || "1900-01-01";
            const prefix = tData.type === 'next' ? '🔜' : '🔥';
            nextEpStr = `${prefix} ${formatShortDate(tData.air_date)} S${tData.season}E${tData.number}`;
          } else {
            sortDate = bestMatch.first_air_date || "1900-01-01";
            releaseDate = sortDate;
          }
        } else {
          sortDate = bestMatch.release_date || "1900-01-01";
          releaseDate = sortDate;
        }
      }
    } catch (e) {}
    
    item.sortDate = sortDate;
    item.releaseDate = releaseDate;
    item.nextEpStr = nextEpStr;
    return item;
  }));
}

async function getTraktEpisodeInfo(tmdbId) {
    const h = { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": TRAKT_CLIENT_ID };
    try {
        let res = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}/next_episode?extended=full`, { headers: h });
        if (res.status !== 200) res = await Widget.http.get(`${TRAKT_API_BASE}/shows/tmdb:${tmdbId}/last_episode?extended=full`, { headers: h });
        if (res.status === 200) {
            const d = JSON.parse(res.body || res.data);
            return { ...d, type: d.first_aired > new Date().toISOString() ? 'next' : 'last', air_date: d.first_aired };
        }
    } catch (e) {}
    return null;
}

function buildProCard(item, sortMode) {
  let sub = item.rating > 0 ? `${item.rating}分` : "";
  let genre = item.year;
  
  if (sortMode === "update" && item.nextEpStr) {
    sub = item.nextEpStr;
  } else if (sortMode === "release") {
    sub = item.releaseDate !== "1900-01-01" ? `📅 ${item.releaseDate}` : "暂无日期";
    genre = item.rating > 0 ? `⭐${item.rating}` : "";
  } else if (item.comment) {
      sub = `💬 ${item.comment}`;
  }

  return {
    id: `db_${item.doubanId}`,
    tmdbId: item.tmdbId || null,
    type: item.tmdbId ? "tmdb" : "web",
    mediaType: item.type,
    title: item.title,
    subTitle: sub,
    genreTitle: genre,
    posterPath: item.pic,
    url: `https://m.douban.com/${item.type}/${item.doubanId}/`
  };
}

// ==========================================
// 2. 个性化推荐
// ==========================================
async function loadSuggestionItems(params) {
  const { cookie } = params;
  if (!cookie) return [{ title: "需填写Cookie", type: "text" }];
  
  const url = `https://m.douban.com/rexxar/api/v2/suggestion?start=0&count=20`;
  try {
    const res = await Widget.http.get(url, { headers: { ...DOUBAN_HEADERS, "Cookie": cookie } });
    const data = JSON.parse(res.body || res.data);
    return (data.items || []).map(i => ({
      id: `rec_${i.id}`,
      title: i.title,
      subTitle: i.card_subtitle || "",
      posterPath: i.pic?.large || "",
      type: "web",
      url: i.url
    }));
  } catch(e) { return [{ title: "推荐获取失败", subTitle: "Cookie可能过期", type: "text" }]; }
}

// ==========================================
// 3. 豆瓣片单 (Doulist)
// ==========================================
async function loadDoulistItems(params) {
    const { doulist_id, page = 1 } = params;
    if (!doulist_id) return [{title: "请输入豆列ID", type: "text"}];
    
    const start = (page - 1) * 25;
    const url = `https://m.douban.com/rexxar/api/v2/doulist/${doulist_id}/items?start=${start}&count=25&ck=&for_mobile=1`;
    
    try {
        const res = await Widget.http.get(url, { headers: DOUBAN_HEADERS });
        const data = JSON.parse(res.body || res.data);
        return (data.items || []).map(i => {
             const sub = i.content || {};
             return {
                 id: `dl_${sub.id}`,
                 title: sub.title,
                 subTitle: sub.rating_value ? `${sub.rating_value}分` : "",
                 posterPath: sub.pic?.large || "",
                 type: "web",
                 url: sub.url
             };
        });
    } catch(e) { return [{title: "片单获取失败", type: "text"}]; }
}

// ==========================================
// 4. 分类找片 (电影/剧集推荐)
// ==========================================
async function loadExploreItems(params) {
    const { type = "movie", tag = "热门" } = params;
    const url = `https://m.douban.com/rexxar/api/v2/movie/recommend?refresh=0&start=0&count=20&selected_categories={}&unselected_categories={}&tags=${encodeURIComponent(tag)}`;
    
    // 注意：豆瓣接口 recommend 默认可能混杂，这里简单请求
    // 另一种接口是 search_tags
    try {
        const res = await Widget.http.get(url.replace("movie", type === "tv" ? "tv" : "movie"), { headers: DOUBAN_HEADERS });
        const data = JSON.parse(res.body || res.data);
        return (data.items || []).map(i => ({
            id: `exp_${i.id}`,
            title: i.title,
            subTitle: i.rating?.value ? `${i.rating.value}分` : "",
            posterPath: i.pic?.large || "",
            type: "web",
            url: `https://m.douban.com/${type}/${i.id}/`
        }));
    } catch(e) { return [{title: "获取失败", type: "text"}]; }
}

// ==========================================
// 5. 影人作品
// ==========================================
async function loadCelebrityWorks(params) {
    const { actor_id, sort = "time" } = params;
    if (!actor_id) return [{title: "请输入影人ID", type: "text"}];
    
    const url = `https://m.douban.com/rexxar/api/v2/celebrity/${actor_id}/works?start=0&count=20&sort=${sort}&ck=&for_mobile=1`;
    try {
        const res = await Widget.http.get(url, { headers: DOUBAN_HEADERS });
        const data = JSON.parse(res.body || res.data);
        return (data.works || []).map(w => {
            const s = w.subject;
            return {
                id: `cel_${s.id}`,
                title: s.title,
                subTitle: s.rating?.value ? `${s.rating.value}分` : w.roles.join('/'),
                genreTitle: s.year,
                posterPath: s.pic?.large || "",
                type: "web",
                url: s.url
            };
        });
    } catch(e) { return [{title: "影人获取失败", type: "text"}]; }
}

// 工具
function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return `${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
}
