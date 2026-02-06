WidgetMetadata = {
  id: "jable_ultra_fix",
  title: "Jable (播放增强版)",
  description: "移植 MissAV 核心解析逻辑，修复无播放资源问题。",
  author: "Jable_Dev",
  site: "https://jable.tv",
  version: "3.0.0",
  requiredVersion: "0.0.2",
  detailCacheDuration: 0, // 详情页不缓存，防止鉴权过期
  modules: [
    {
      title: "搜索",
      description: "搜索影片",
      requiresWebView: false,
      functionName: "searchVideo",
      cacheDuration: 300,
      params: [
        {
          name: "keyword",
          title: "关键词",
          type: "input",
          description: "输入番号或女优名",
        },
        { name: "page", title: "页码", type: "page", value: "1" },
      ],
    },
    {
      title: "热门榜单",
      description: "近期热门影片",
      requiresWebView: false,
      functionName: "getRankList",
      cacheDuration: 3600,
      params: [
        {
          name: "sort_by",
          title: "榜单类型",
          type: "enumeration",
          enumOptions: [
            { title: "本周热门", value: "video_viewed_week" },
            { title: "本月热门", value: "video_viewed_month" },
            { title: "历史最热", value: "video_viewed" },
            { title: "最多收藏", value: "most_favourited" },
          ],
          value: "video_viewed_week"
        },
        { name: "page", title: "页码", type: "page", value: "1" },
      ],
    },
    {
      title: "最新更新",
      description: "最新发布的影片",
      requiresWebView: false,
      functionName: "getNewList",
      cacheDuration: 300,
      params: [
        { name: "page", title: "页码", type: "page", value: "1" },
      ],
    }
  ],
};

// =================== 核心逻辑区 ===================

const BASE_URL = "https://jable.tv";
// 模拟真实浏览器头信息，这是 JAVDay 和 MissAV 成功的关键
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://jable.tv/",
  "Origin": "https://jable.tv",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

/**
 * 搜索功能
 * 采用网页直连模式，避开 API 的坑
 */
async function searchVideo(params) {
  const keyword = params.keyword;
  if (!keyword) return [];

  const page = parseInt(params.page) || 1;
  const fromIndex = (page - 1) * 24 + 1;

  const url = `${BASE_URL}/search/${encodeURIComponent(keyword)}/?from=${fromIndex}&sort_by=post_date`;
  
  return await fetchAndParseList(url);
}

/**
 * 热门榜单
 */
async function getRankList(params) {
  const sort = params.sort_by || "video_viewed_week";
  const page = parseInt(params.page) || 1;
  const fromIndex = (page - 1) * 24 + 1;

  // 榜单 API 还是稳的，且带封面加载更快
  const url = `${BASE_URL}/hot/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=${sort}&from=${fromIndex}`;

  return await fetchAndParseList(url);
}

/**
 * 最新更新
 */
async function getNewList(params) {
  const page = parseInt(params.page) || 1;
  const fromIndex = (page - 1) * 24 + 1;

  const url = `${BASE_URL}/new-release/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=${fromIndex}`;

  return await fetchAndParseList(url);
}

/**
 * 通用：请求列表并解析 HTML
 */
async function fetchAndParseList(url) {
  try {
    const res = await Widget.http.get(url, { headers: HEADERS });
    const html = res.data;
    
    if (!html || html.length < 100) return [];

    const $ = Widget.html.load(html);
    const items = [];

    // Jable 的通用视频卡片结构
    $(".video-img-box").each((i, el) => {
      const $el = $(el);
      
      const titleLink = $el.find(".title a");
      const title = titleLink.text().trim();
      let href = titleLink.attr("href");
      
      const imgTag = $el.find(".img-box img");
      // 兼容懒加载 data-src
      let cover = imgTag.attr("data-src") || imgTag.attr("src");
      
      const duration = $el.find(".label").text().trim();

      if (href && !href.startsWith("http")) {
        // 防止相对路径问题
        href = href; 
      }

      if (title && href) {
        items.push({
          title: title,
          link: href, // 详情页链接
          backdropPath: cover, // 横向大图
          releaseDate: duration, // 右下角时长
          type: "movie", // Forward 识别为电影
          id: href // 唯一 ID
        });
      }
    });

    return items;
  } catch (e) {
    console.log("List fetch error: " + e.message);
    return [];
  }
}

/**
 * 详情页 & 播放解析 (核心重构部分)
 * 移植了 MissAV 和 JAVDay 的多重抓取逻辑
 */
async function loadDetail(link) {
  try {
    const res = await Widget.http.get(link, { headers: HEADERS });
    const html = res.data;

    let m3u8Url = "";

    // 策略 1: 查找标准 hlsUrl 变量 (Jable 原生写法)
    const standardMatch = html.match(/var hlsUrl\s*=\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/);
    if (standardMatch && standardMatch[1]) {
      m3u8Url = standardMatch[1];
    } 
    
    // 策略 2: 暴力正则扫描 (MissAV/JAVDay 核心逻辑)
    // 只要是 http 开头，.m3u8 结尾的字符串，都抓出来
    if (!m3u8Url) {
      const globalRegex = /https?:\/\/[^\s"']+\.m3u8[^\s"']*/;
      const globalMatch = html.match(globalRegex);
      if (globalMatch && globalMatch[0]) {
        m3u8Url = globalMatch[0];
      }
    }

    if (!m3u8Url) {
      throw new Error("解析失败：未找到视频资源");
    }

    // 提取推荐列表 (猜你喜欢)
    const $ = Widget.html.load(html);
    const relatedItems = [];
    $("#list_videos_common_videos_list .video-img-box").each((i, el) => {
        const $el = $(el);
        const titleLink = $el.find(".title a");
        if(titleLink.length){
            relatedItems.push({
                title: titleLink.text().trim(),
                link: titleLink.attr("href"),
                backdropPath: $el.find("img").attr("data-src") || $el.find("img").attr("src"),
                type: "movie",
                id: titleLink.attr("href")
            });
        }
    });

    return {
      id: link,
      title: $(".header-left h4").text().trim() || "Jable Video",
      description: `时长: ${$(".header-left .visible-xs").text().trim()}`,
      
      // 核心播放字段
      videoUrl: m3u8Url, 
      mediaType: "movie",
      playerType: "system", // 调用系统播放器
      
      // 关键：防盗链头信息
      customHeaders: {
        "User-Agent": HEADERS["User-Agent"],
        "Referer": link, // 必须指向当前详情页 URL
        "Origin": BASE_URL
      },
      
      childItems: relatedItems // 底部推荐视频
    };

  } catch (e) {
    console.log("Detail fetch error: " + e.message);
    throw e;
  }
}
