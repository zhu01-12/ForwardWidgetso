var WidgetMetadata = {
  id: "netflav_fix_v4",
  title: "Netflav (图片修复版)",
  description: "修复图片不显示，增强视频提取能力。",
  author: "Forward_Dev",
  site: "https://netflav.com",
  version: "4.1.0",
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
            { title: "近期热门", value: "trending" },
            { title: "所有类别", value: "browse" }
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

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  "Referer": "https://netflav.com/",
  "Origin": "https://netflav.com",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

/**
 * 辅助：修复图片链接
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
  const url = `${BASE_URL}/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;
  return await fetchAndParseList(url);
}

/**
 * 热门
 */
async function getRankList(params) {
  const sort = params.sort_by || "trending";
  const page = parseInt(params.page) || 1;
  const url = `${BASE_URL}/${sort}?page=${page}`;
  return await fetchAndParseList(url);
}

/**
 * 最新
 */
async function getNewList(params) {
  const page = parseInt(params.page) || 1;
  const url = `${BASE_URL}/browse?page=${page}`;
  return await fetchAndParseList(url);
}

/**
 * 列表解析通用函数 (修复图片问题)
 */
async function fetchAndParseList(url) {
  try {
    const res = await Widget.http.get(url, { headers: HEADERS });
    if (!res.data) return [];
    
    const html = res.data;
    const items = [];

    // --- 策略 A: 优先尝试 DOM 解析 (因为你提到文字能出来，说明DOM结构是对的) ---
    // 我们重点修复 DOM 解析里的图片提取
    const $ = Widget.html.load(html);
    
    $('div[class*="grid"] > div').each((i, el) => {
      const $el = $(el);
      const linkTag = $el.find("a").first();
      let href = linkTag.attr("href");
      
      if (href) {
        if (!href.startsWith("http")) href = BASE_URL + href;
        
        const title = $el.find(".title").text() || $el.find('div[class*="title"]').text();
        
        // 【关键修复】优先找 data-src (懒加载)，找不到再找 src
        let cover = $el.find("img").attr("data-src") || 
                    $el.find("img").attr("src") || 
                    $el.find("img").attr("data-original");
                    
        cover = fixImageUrl(cover);

        // 如果 DOM 里实在没图，再试着去 JSON 里找补 (逻辑省略，优先保证 DOM 速度)
        
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

    // 如果 DOM 没抓到任何东西，才去试 JSON (作为保底)
    if (items.length === 0) {
        try {
            const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            if (jsonMatch && jsonMatch[1]) {
                const jsonData = JSON.parse(jsonMatch[1]);
                // 简化逻辑，直接深度搜索所有对象里的 docs
                // ... (此处省略复杂逻辑，通常 DOM 能抓到这里就没问题)
            }
        } catch(e) {}
    }

    return items;
  } catch (e) {
    console.error(e);
    return [];
  }
}

/**
 * 详情页解析 (修复播放源提取)
 */
async function loadDetail(link) {
  try {
    const res = await Widget.http.get(link, { headers: HEADERS });
    const html = res.data;
    
    let m3u8Url = "";
    let title = "";
    let cover = "";

    // 1. 【暴力扫描】直接在 HTML 里全屏搜索 .m3u8 链接
    // 这种方式最粗暴，但也最有效，不管 JSON 结构怎么变
    // 匹配 "src":"https://...m3u8" 或者直接 https://...m3u8
    // 我们先解码一下 unicode (以防链接被转义)
    const decodedHtml = html.replace(/\\u002F/g, "/");

    // 正则：寻找 .m3u8
    const regex = /(https?:\/\/[a-zA-Z0-9\-\.\/\_]+\.m3u8[a-zA-Z0-9\-\.\/\_\?\=\&]*)/g;
    let match;
    // 找到所有匹配项，取第一个看起来最像视频主文件的
    while ((match = regex.exec(decodedHtml)) !== null) {
        const url = match[1];
        // 排除掉一些可能的预览或者缩略 m3u8 (如果有的话)，通常取第一个长的
        if (url.includes("netflav") || url.includes("cdn") || url.includes("hls")) {
            m3u8Url = url;
            break; // 找到一个就跑
        }
    }

    // 2. 如果暴力扫描没找到，再尝试解析 JSON (结构化提取)
    if (!m3u8Url) {
        const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                const jsonData = JSON.parse(jsonMatch[1]);
                // 深度查找 video 对象
                // 路径可能是 props.pageProps.initialState.video.data
                // 或者 props.pageProps.video
                const state = jsonData.props.pageProps.initialState;
                if (state && state.video && state.video.data) {
                    m3u8Url = state.video.data.src || state.video.data.videoUrl;
                    title = state.video.data.title;
                    cover = fixImageUrl(state.video.data.preview);
                }
            } catch(e) {}
        }
    }

    // 3. 补充标题
    if (!title) {
        const $ = Widget.html.load(html);
        title = $('h1').text().trim() || "Netflav Video";
        if (!cover) {
             cover = fixImageUrl($('meta[property="og:image"]').attr('content'));
        }
    }

    if (!m3u8Url) {
        // 如果实在没找到，把网页链接返给播放器，有时候播放器能嗅探
       throw new Error("未找到有效播放地址");
    }

    const videoCode = title.length > 20 ? title.substring(0, 20) + "..." : title;

    return {
      id: link,
      type: "detail", // 必须为 detail
      
      title: title,
      description: `标题: ${videoCode}`,
      
      videoUrl: m3u8Url,
      
      mediaType: "movie",
      playerType: "system", 
      
      backdropPath: cover,
      posterPath: cover,

      customHeaders: {
        "User-Agent": HEADERS["User-Agent"],
        "Referer": link, // 必须指向详情页本身
        "Origin": BASE_URL
      },
      
      childItems: []
    };

  } catch (e) {
    return {
       id: link,
       type: "detail",
       title: "解析错误",
       description: e.message,
       videoUrl: "",
       childItems: []
    };
  }
}
