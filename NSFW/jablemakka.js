WidgetMetadata = {
  id: "jable_final_spec_v4",
  title: "Jable (规范修复版)",
  description: "严格适配 Forward 规范，修复详情页类型定义。",
  author: "Jable_Dev",
  site: "https://jable.tv",
  version: "4.0.0",
  requiredVersion: "0.0.2",
  detailCacheDuration: 0, // 详情页不缓存
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
          description: "番号/女优",
        },
        { name: "page", title: "页码", type: "page", value: "1" },
      ],
    },
    {
      title: "热门榜单",
      description: "热门影片",
      requiresWebView: false,
      functionName: "getRankList",
      cacheDuration: 3600,
      params: [
        {
          name: "sort_by",
          title: "类型",
          type: "enumeration",
          enumOptions: [
            { title: "本周热门", value: "video_viewed_week" },
            { title: "本月热门", value: "video_viewed_month" },
            { title: "历史最热", value: "video_viewed" },
          ],
          value: "video_viewed_week"
        },
        { name: "page", title: "页码", type: "page", value: "1" },
      ],
    },
    {
      title: "最新更新",
      description: "最新影片",
      requiresWebView: false,
      functionName: "getNewList",
      cacheDuration: 300,
      params: [
        { name: "page", title: "页码", type: "page", value: "1" },
      ],
    }
  ],
};

// =================== 核心逻辑 ===================

const BASE_URL = "https://jable.tv";
// 统一请求头，模仿真实浏览器
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://jable.tv/",
  "Origin": "https://jable.tv",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

/**
 * 搜索 (网页直连模式)
 */
async function searchVideo(params) {
  const keyword = params.keyword;
  if (!keyword) return [];
  const page = parseInt(params.page) || 1;
  const fromIndex = (page - 1) * 24 + 1;
  
  // 构造搜索页 URL
  const url = `${BASE_URL}/search/${encodeURIComponent(keyword)}/?from=${fromIndex}&sort_by=post_date`;
  return await fetchAndParseList(url);
}

/**
 * 热门
 */
async function getRankList(params) {
  const sort = params.sort_by || "video_viewed_week";
  const page = parseInt(params.page) || 1;
  const fromIndex = (page - 1) * 24 + 1;
  const url = `${BASE_URL}/hot/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=${sort}&from=${fromIndex}`;
  return await fetchAndParseList(url);
}

/**
 * 最新
 */
async function getNewList(params) {
  const page = parseInt(params.page) || 1;
  const fromIndex = (page - 1) * 24 + 1;
  const url = `${BASE_URL}/new-release/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=${fromIndex}`;
  return await fetchAndParseList(url);
}

/**
 * 列表解析通用函数
 */
async function fetchAndParseList(url) {
  try {
    const res = await Widget.http.get(url, { headers: HEADERS });
    if (!res.data) return [];

    const $ = Widget.html.load(res.data);
    const items = [];

    $(".video-img-box").each((i, el) => {
      const $el = $(el);
      const titleLink = $el.find(".title a");
      const title = titleLink.text().trim();
      const href = titleLink.attr("href");
      
      const imgTag = $el.find(".img-box img");
      const cover = imgTag.attr("data-src") || imgTag.attr("src");
      const duration = $el.find(".label").text().trim();

      if (title && href) {
        items.push({
          id: href, // 唯一标识符
          type: "movie", // 列表项必须是 movie (或其他卡片类型)
          title: title,
          link: href, // 传递给 loadDetail 的参数
          backdropPath: cover,
          releaseDate: duration, 
        });
      }
    });

    return items;
  } catch (e) {
    console.error(e);
    return [];
  }
}

/**
 * 详情页解析 (关键修复点)
 */
async function loadDetail(link) {
  try {
    const res = await Widget.http.get(link, { headers: HEADERS });
    const html = res.data;
    
    // 1. 提取 m3u8 链接
    // 匹配 var hlsUrl = "..." 或 '...'，兼容空格
    let m3u8Url = "";
    const match = html.match(/var\s+hlsUrl\s*=\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i);
    if (match && match[1]) {
      m3u8Url = match[1];
    }

    if (!m3u8Url) {
      throw new Error("未找到视频地址，可能需要登录");
    }

    // 2. 提取推荐视频
    const $ = Widget.html.load(html);
    const relatedItems = [];
    $("#list_videos_common_videos_list .video-img-box").each((i, el) => {
        const $el = $(el);
        const tLink = $el.find(".title a");
        if(tLink.length) {
            relatedItems.push({
                id: tLink.attr("href"),
                type: "movie",
                title: tLink.text().trim(),
                link: tLink.attr("href"),
                backdropPath: $el.find("img").attr("data-src") || $el.find("img").attr("src"),
                releaseDate: $el.find(".label").text().trim()
            });
        }
    });

    const title = $(".header-left h4").text().trim() || "Jable Video";
    const videoCode = title.split(" ")[0]; // 尝试提取番号

    // 3. 构造符合规范的 Detail 对象
    // 规范重点：
    // - type: 必须是 "detail"
    // - videoUrl: 必须存在
    // - customHeaders: 必须包含 Referer
    return {
      id: link,
      type: "detail", // 修正：此前为 "movie"，导致播放器无法接管
      
      title: title,
      description: `番号: ${videoCode}`,
      
      videoUrl: m3u8Url,
      
      mediaType: "movie", // 辅助标记，非核心
      playerType: "system", // 使用系统 AVPlayer
      
      // 关键：Jable 必须验证 Referer
      customHeaders: {
        "User-Agent": HEADERS["User-Agent"],
        "Referer": link,
        "Origin": BASE_URL
      },
      
      childItems: relatedItems
    };

  } catch (e) {
    // 容错处理：如果解析失败，返回一个带错误信息的对象，避免APP崩溃
    console.log("Detail Error: " + e.message);
    return {
       id: link,
       type: "detail",
       title: "解析失败",
       description: e.message,
       videoUrl: "", // 空地址会提示无资源，但不会闪退
       childItems: []
    };
  }
}
