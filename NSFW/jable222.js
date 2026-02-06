WidgetMetadata = {
  id: "jable_rewrite_pure_v2",
  title: "Jable (搜索修复版)",
  description: "修复搜索报错问题，采用网页直连模式。",
  author: "Jable_Dev",
  site: "https://jable.tv",
  version: "2.1.0",
  requiredVersion: "0.0.2",
  detailCacheDuration: 0,
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
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://jable.tv/",
  "Origin": "https://jable.tv"
};

/**
 * 搜索功能 - 修复版
 * 放弃 mode=async，直接请求页面 HTML，避免 API 返回空数据
 */
async function searchVideo(params) {
  const keyword = params.keyword;
  if (!keyword) return [];

  const page = parseInt(params.page) || 1;
  const fromIndex = (page - 1) * 24 + 1;

  // 修正：直接构建网页 URL，而不是 API URL
  // 例如：https://jable.tv/search/keyword/?from=1&sort_by=post_date
  const url = `${BASE_URL}/search/${encodeURIComponent(keyword)}/?from=${fromIndex}&sort_by=post_date`;
  
  // 搜索结果页也是标准的列表结构，fetchAndParseList 可以通用解析
  return await fetchAndParseList(url);
}

/**
 * 热门榜单
 * 榜单 API 既然正常，继续保持 mode=async 提高速度
 */
async function getRankList(params) {
  const sort = params.sort_by || "video_viewed_week";
  const page = parseInt(params.page) || 1;
  const fromIndex = (page - 1) * 24 + 1;

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

    // 解析 .video-img-box 元素
    $(".video-img-box").each((i, el) => {
      const $el = $(el);
      
      const titleLink = $el.find(".title a");
      const title = titleLink.text().trim();
      let href = titleLink.attr("href");
      
      const imgTag = $el.find(".img-box img");
      let cover = imgTag.attr("data-src") || imgTag.attr("src");
      
      const duration = $el.find(".label").text().trim();

      if (href && !href.startsWith("http")) {
        href = href; 
      }

      if (title && href) {
        items.push({
          title: title,
          link: href, 
          backdropPath: cover, 
          releaseDate: duration, 
          type: "movie", 
          id: href 
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
 * 详情页 & 播放解析
 */
async function loadDetail(link) {
  try {
    const res = await Widget.http.get(link, { headers: HEADERS });
    const html = res.data;

    // 正则提取 hlsUrl
    const hlsMatch = html.match(/var hlsUrl\s*=\s*'(https?:\/\/[^']+)'/);
    
    if (!hlsMatch) {
      throw new Error("未找到视频地址，可能需要登录或资源已失效");
    }

    const m3u8Url = hlsMatch[1];

    // 提取推荐列表
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
      description: $(".header-left .visible-xs").text().trim(),
      videoUrl: m3u8Url, 
      mediaType: "movie",
      playerType: "system", 
      customHeaders: {
        "User-Agent": HEADERS["User-Agent"],
        "Referer": link, // 必须带上
        "Origin": BASE_URL
      },
      childItems: relatedItems 
    };

  } catch (e) {
    console.log("Detail fetch error: " + e.message);
    throw e;
  }
}
