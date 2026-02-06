var WidgetMetadata = {
  id: "netflav_spec_v4",
  title: "Netflav (规范修复版)",
  description: "严格适配 Forward 规范，修复播放器识别问题。",
  author: "Forward_Dev",
  site: "https://netflav.com",
  version: "4.0.0",
  requiredVersion: "0.0.2",
  detailCacheDuration: 0, // 详情页不缓存，防止链接失效
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
            { title: "近期热门", value: "trending" }, // Netflav 的 Trending
            { title: "所有类别", value: "browse" }     // Netflav 的 Browse
          ],
          value: "trending"
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

const BASE_URL = "https://netflav.com";

// Netflav 必须的请求头，防止 403
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  "Referer": "https://netflav.com/",
  "Origin": "https://netflav.com",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

/**
 * 辅助：修复图片链接 (Netflav 经常返回相对路径)
 */
function fixImageUrl(url) {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${BASE_URL}${url}`;
}

/**
 * 搜索
 */
async function searchVideo(params) {
  const keyword = params.keyword;
  if (!keyword) return [];
  const page = parseInt(params.page) || 1;
  
  // URL: https://netflav.com/search?keyword=xxx&page=1
  const url = `${BASE_URL}/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;
  return await fetchAndParseList(url);
}

/**
 * 热门
 */
async function getRankList(params) {
  const sort = params.sort_by || "trending";
  const page = parseInt(params.page) || 1;
  // URL: https://netflav.com/trending?page=1
  const url = `${BASE_URL}/${sort}?page=${page}`;
  return await fetchAndParseList(url);
}

/**
 * 最新
 */
async function getNewList(params) {
  const page = parseInt(params.page) || 1;
  // Netflav 默认 browse 也就是按时间排序
  const url = `${BASE_URL}/browse?page=${page}`;
  return await fetchAndParseList(url);
}

/**
 * 列表解析通用函数 (混合模式：JSON优先 -> DOM兜底)
 */
async function fetchAndParseList(url) {
  try {
    const res = await Widget.http.get(url, { headers: HEADERS });
    if (!res.data) return [];
    
    const html = res.data;
    const items = [];

    // --- 策略 A: Next.js JSON 解析 (最稳) ---
    try {
        const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (jsonMatch && jsonMatch[1]) {
            const jsonData = JSON.parse(jsonMatch[1]);
            const state = jsonData.props.pageProps.initialState;
            let docs = [];

            // 深度查找 docs 数组
            if (state) {
                Object.keys(state).forEach(key => {
                    if (state[key] && state[key].docs) {
                        docs = state[key].docs;
                    }
                });
            }

            if (docs.length > 0) {
                docs.forEach(doc => {
                    const img = fixImageUrl(doc.preview_url || doc.preview || doc.thumb);
                    items.push({
                        id: `${BASE_URL}/video?id=${doc.videoId}`,
                        type: "movie", // 列表项必须是 movie
                        title: doc.title,
                        link: `${BASE_URL}/video?id=${doc.videoId}`,
                        backdropPath: img,
                        posterPath: img,
                        releaseDate: doc.sourceDate ? doc.sourceDate.split('T')[0] : "",
                    });
                });
                return items; // 如果 JSON 成功，直接返回
            }
        }
    } catch (e) {
        console.log("JSON Parse Error, trying DOM...");
    }

    // --- 策略 B: DOM 解析 (备用) ---
    const $ = Widget.html.load(html);
    $('div[class*="grid"] > div').each((i, el) => {
      const $el = $(el);
      const linkTag = $el.find("a").first();
      let href = linkTag.attr("href");
      
      if (href) {
        if (!href.startsWith("http")) href = BASE_URL + href;
        
        const title = $el.find(".title").text() || $el.find('div[class*="title"]').text();
        let cover = $el.find("img").attr("src");
        cover = fixImageUrl(cover);

        items.push({
          id: href,
          type: "movie",
          title: title.trim(),
          link: href,
          backdropPath: cover,
          posterPath: cover,
          releaseDate: $el.find(".date").text().trim(), 
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
    
    let m3u8Url = "";
    let title = "";
    let cover = "";

    // 1. 尝试从 Next.js JSON 提取高清数据
    const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (jsonMatch && jsonMatch[1]) {
        try {
            const jsonData = JSON.parse(jsonMatch[1]);
            const videoData = jsonData.props.pageProps.initialState.video.data;
            if (videoData) {
                title = videoData.title;
                m3u8Url = videoData.src || videoData.videoUrl;
                cover = fixImageUrl(videoData.preview || videoData.thumb);
            }
        } catch(e) {}
    }

    // 2. 如果 JSON 没拿到 m3u8，尝试正则暴力提取
    if (!m3u8Url) {
        const match = html.match(/(https?:\/\/[^"']+\.m3u8[^"']*)/);
        if (match && match[1]) {
            m3u8Url = match[1];
        }
    }

    if (!m3u8Url) {
       // 3. 最后的挣扎：DOM 查找 video 标签
       const $ = Widget.html.load(html);
       m3u8Url = $('video').attr('src') || $('source').attr('src');
       if (!title) title = $('h1').text().trim();
    }

    if (!m3u8Url) {
      throw new Error("未找到视频地址");
    }

    const videoCode = title.substring(0, 15); // 简单截取作为番号描述

    // 3. 构造符合规范的 Detail 对象
    // 关键修复：type: "detail"
    return {
      id: link,
      type: "detail", // 核心修正：告诉 Forward 这是详情页，不要去 TMDB 搜刮了！
      
      title: title,
      description: `番号: ${videoCode}`,
      
      videoUrl: m3u8Url,
      
      mediaType: "movie",
      playerType: "system", 
      
      // 封面图 (详情页也最好提供)
      backdropPath: cover,
      posterPath: cover,

      // 关键：Netflav 必须验证 Referer，否则 403
      customHeaders: {
        "User-Agent": HEADERS["User-Agent"],
        "Referer": BASE_URL + "/", // 必须带
        "Origin": BASE_URL
      },
      
      // 推荐列表为空，防止详情页嵌套加载出错
      childItems: []
    };

  } catch (e) {
    console.log("Detail Error: " + e.message);
    return {
       id: link,
       type: "detail",
       title: "解析失败",
       description: e.message,
       videoUrl: "",
       childItems: []
    };
  }
}
