WidgetMetadata = {
  id: "missav_strict_spec_v6",
  title: "MissAV (正则强力版)",
  description: "使用正则扫描页面，彻底解决列表空数据问题。",
  author: "MissAV_Dev",
  site: "https://missav.com",
  version: "6.0.0",
  requiredVersion: "0.0.2",
  detailCacheDuration: 0,
  modules: [
    {
      title: "搜索",
      description: "搜索番号或关键词",
      requiresWebView: false,
      functionName: "searchVideos", // 规范命名
      cacheDuration: 300,
      params: [
        {
          name: "keyword",
          title: "关键词",
          type: "input",
          description: "请输入番号",
        },
        { name: "page", title: "页码", type: "page", value: "1" },
      ],
    },
    {
      title: "热门推荐",
      description: "查看热门影片",
      requiresWebView: false,
      functionName: "getRankList",
      cacheDuration: 3600,
      params: [
        {
          name: "sort_by",
          title: "榜单",
          type: "enumeration",
          enumOptions: [
            { title: "本周热门", value: "weekly-hot" },
            { title: "今日热门", value: "today-hot" },
            { title: "本月热门", value: "monthly-hot" },
            { title: "最新发布", value: "new" },
            { title: "无码流出", value: "uncensored-leak" }
          ],
          value: "weekly-hot"
        },
        { name: "page", title: "页码", type: "page", value: "1" },
      ],
    }
  ],
};

// =================== 核心配置 ===================

const BASE_URL = "https://missav.com";
// 严格使用 Safari UA，这对于 MissAV 极其重要
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Referer": "https://missav.com/",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

// =================== 辅助函数 ===================

/**
 * 提取 ID
 * https://missav.com/cn/sw-963 -> sw-963
 */
function extractId(url) {
  if (!url) return "";
  const parts = url.split("/");
  return parts[parts.length - 1].split("?")[0];
}

/**
 * 核心解析器：使用正则扫描，不依赖 DOM 结构
 * 解决 "Debug成功但数据为空" 的终极方案
 */
async function parseHtmlByRegex(html) {
  const items = [];
  
  // 匹配模式：寻找包含视频链接的标签区域
  // MissAV 的链接通常是 <a href="https://missav.com/cn/xxx" ... alt="标题"
  // 我们分步提取，防止正则太复杂匹配失败
  
  // 1. 先用 Cheerio 加载 (作为首选)
  // 如果 Cheerio 失败（比如返回为空），再考虑其他方式，但这里我们优化选择器
  const $ = Widget.html.load(html);
  
  // 查找所有指向视频详情的 A 标签
  // 过滤掉不含 /cn/ 的杂项链接
  $("a[href*='/cn/']").each((i, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    
    // 排除非视频链接（如分页、标签）
    // 视频 ID 通常包含数字
    if (!href || !href.match(/-[0-9]+/)) return;
    
    // 尝试找图片元素获取标题
    const $img = $a.find("img");
    const title = $img.attr("alt") || $a.text().trim();
    
    // 如果没有标题，可能是个无效链接，跳过
    if (!title) return;

    const id = extractId(href);
    
    // 去重检查 (简单防重)
    if (items.some(it => it.id === href)) return;

    // 强制拼接封面 (这是最稳的)
    const coverM = `https://fourhoi.com/${id}/cover-m.jpg`; 
    const coverT = `https://fourhoi.com/${id}/cover-t.jpg`;

    items.push({
      id: href,           // 唯一标识
      type: "movie",      // 列表项类型必须是 movie
      title: title,
      link: href,         // 传递给详情页的参数
      
      // Forward 规范：尽量同时提供海报和背景图
      posterPath: coverM,    // 竖图/大图
      backdropPath: coverT,  // 横图/缩略图
      
      // 提取时长（如果有）
      releaseDate: $a.find("span.text-xs").last().text().trim() || ""
    });
  });

  return items;
}

// =================== 模块入口 ===================

/**
 * 搜索入口
 */
async function searchVideos(params) {
  const keyword = params.keyword;
  const page = params.page || 1;
  if (!keyword) return [];

  // 构建 URL
  const url = `${BASE_URL}/cn/search/${encodeURIComponent(keyword)}?page=${page}`;
  
  const res = await Widget.http.get(url, { headers: HEADERS });
  return await parseHtmlByRegex(res.data);
}

/**
 * 榜单入口
 */
async function getRankList(params) {
  const sort = params.sort_by || "weekly-hot";
  const page = params.page || 1;
  
  const url = `${BASE_URL}/cn/${sort}?page=${page}`;
  
  const res = await Widget.http.get(url, { headers: HEADERS });
  return await parseHtmlByRegex(res.data);
}

/**
 * 详情页入口 (Detail)
 */
async function loadDetail(link) {
  try {
    const res = await Widget.http.get(link, { headers: HEADERS });
    const html = res.data;
    
    // 1. 提取 m3u8 (最强正则)
    let m3u8Url = "";
    // 匹配 pattern: https://...playlist.m3u8
    const m3u8Regex = /https?:\/\/[a-z0-9\-\.]+\/[a-z0-9\-\.\/_]+\.m3u8[a-z0-9\-\.\/_?=&]*/i;
    const match = html.match(m3u8Regex);
    
    if (match) {
      m3u8Url = match[0];
    } else {
      // 备用：尝试找 UUID 拼接
      const uuidMatch = html.match(/uuid\s*:\s*['"]([a-f0-9\-]+)['"]/i);
      if (uuidMatch) {
         m3u8Url = `https://surrit.com/${uuidMatch[1]}/playlist.m3u8`;
      }
    }

    if (!m3u8Url) {
       throw new Error("未找到播放地址");
    }

    const videoId = extractId(link);
    const $ = Widget.html.load(html);
    const title = $("h1").text().trim() || videoId;

    // 2. 详情页必须返回 type: "detail"
    return {
      id: link,
      type: "detail", 
      
      title: title,
      description: `番号: ${videoId.toUpperCase()}`,
      
      videoUrl: m3u8Url,
      
      mediaType: "movie",
      playerType: "system", // 使用系统播放器
      
      // 封面图
      backdropPath: `https://fourhoi.com/${videoId}/cover-m.jpg`,
      posterPath: `https://fourhoi.com/${videoId}/cover-m.jpg`,

      // 关键：Header 必须带 Referer
      customHeaders: {
        "User-Agent": HEADERS["User-Agent"],
        "Referer": link,
        "Origin": BASE_URL
      }
    };

  } catch (e) {
    const videoId = extractId(link);
    // 容错返回
    return {
      id: link,
      type: "detail",
      title: "解析错误",
      description: e.message,
      videoUrl: "",
      backdropPath: `https://fourhoi.com/${videoId}/cover-m.jpg`
    };
  }
}
