WidgetMetadata = {
  id: "jable_manual_v1",
  title: "Jable (手动搜索版)",
  description: "获取 Jable 视频，支持手动输入关键词",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  site: "https://makkapakka518.vercel.app/",
  version: "1.2.1",
  requiredVersion: "0.0.2",
  detailCacheDuration: 60,
  modules: [
    // 搜索模块
    {
      title: "搜索",
      description: "搜索",
      requiresWebView: false,
      functionName: "search",
      cacheDuration: 3600,
      params: [
        {
          name: "keyword",
          title: "关键词",
          type: "input",
          description: "关键词",
        },
        {
          name: "sort_by",
          title: "排序",
          type: "enumeration",
          description: "排序",
          enumOptions: [
            { title: "最多观看", value: "video_viewed" },
            { title: "近期最佳", value: "post_date_and_popularity" },
            { title: "最近更新", value: "post_date" },
            { title: "最多收藏", value: "most_favourited" },
          ],
        },
        { name: "from", title: "页码", type: "page", description: "页码", value: "1" },
      ],
    },
    // 热门模块
    {
      title: "热门",
      description: "热门影片",
      requiresWebView: false,
      functionName: "loadPage",
      cacheDuration: 3600,
      params: [
        {
          name: "url",
          title: "列表地址",
          type: "constant",
          description: "列表地址",
          value: "https://jable.tv/hot/?mode=async&function=get_block&block_id=list_videos_common_videos_list",
        },
        {
          name: "sort_by",
          title: "排序",
          type: "enumeration",
          description: "排序",
          enumOptions: [
            { title: "今日热门", value: "video_viewed_today" },
            { title: "本周热门", value: "video_viewed_week" },
            { title: "本月热门", value: "video_viewed_month" },
            { title: "所有时间", value: "video_viewed" },
          ],
        },
        { name: "from", title: "页码", type: "page", description: "页码", value: "1" },
      ],
    },
    // 最新模块
    {
      title: "最新",
      description: "最新上市影片",
      requiresWebView: false,
      functionName: "loadPage",
      cacheDuration: 3600,
      params: [
        {
          name: "url",
          title: "列表地址",
          type: "constant",
          description: "列表地址",
          value: "https://jable.tv/new-release/?mode=async&function=get_block&block_id=list_videos_common_videos_list",
        },
        {
          name: "sort_by",
          title: "排序",
          type: "enumeration",
          description: "排序",
          enumOptions: [
            { title: "最新发布", value: "latest-updates" },
            { title: "最多观看", value: "video_viewed" },
            { title: "最多收藏", value: "most_favourited" },
          ],
        },
        { name: "from", title: "页码", type: "page", description: "页码", value: "1" },
      ],
    },
    // 中文模块
    {
      title: "中文",
      description: "中文字幕影片",
      requiresWebView: false,
      functionName: "loadPage",
      cacheDuration: 3600,
      params: [
        {
          name: "url",
          title: "列表地址",
          type: "constant",
          description: "列表地址",
          value: "https://jable.tv/categories/chinese-subtitle/?mode=async&function=get_block&block_id=list_videos_common_videos_list",
        },
        {
          name: "sort_by",
          title: "排序",
          type: "enumeration",
          description: "排序",
          enumOptions: [
            { title: "最近更新", value: "post_date" },
            { title: "最多观看", value: "video_viewed" },
            { title: "最多收藏", value: "most_favourited" },
          ],
        },
        { name: "from", title: "页码", type: "page", description: "页码", value: "1" },
      ],
    },
    // 女优模块
    {
      title: "女优",
      description: "按女优分类浏览影片",
      requiresWebView: false,
      functionName: "loadPage",
      cacheDuration: 3600,
      params: [
        {
          name: "manual_keyword",
          title: "手动搜索(填此忽略下拉)",
          type: "input",
          description: "输入女优名直接搜索",
        },
        {
          name: "url",
          title: "选择女优",
          type: "enumeration",
          belongTo: {
            paramName: "sort_by",
            value: ["post_date","video_viewed","most_favourited"],
          },
          enumOptions: [
            { 
              title: "三上悠亚", 
              value: "https://jable.tv/s1/models/yua-mikami/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "楪可怜", 
              value: "https://jable.tv/models/86b2f23f95cc485af79fe847c5b9de8d/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "小野夕子", 
              value: "https://jable.tv/models/2958338aa4f78c0afb071e2b8a6b5f1b/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "大槻响", 
              value: "https://jable.tv/models/hibiki-otsuki/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "河北彩伽", 
              value: "https://jable.tv/models/saika-kawakita2/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "JULIA", 
              value: "https://jable.tv/models/julia/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "明里䌷", 
              value: "https://jable.tv/models/tsumugi-akari/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "桃乃木香奈", 
              value: "https://jable.tv/models/momonogi-kana/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "篠田ゆう", 
              value: "https://jable.tv/s1/models/shinoda-yuu/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "枫可怜", 
              value: "https://jable.tv/models/kaede-karen/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "美谷朱里", 
              value: "https://jable.tv/s1/models/mitani-akari/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "山岸逢花", 
              value: "https://jable.tv/models/yamagishi-aika/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "八掛うみ", 
              value: "https://jable.tv/models/83397477054d35cd07e2c48685335a86/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "八木奈々", 
              value: "https://jable.tv/models/3610067a1d725dab8ee8cd3ffe828850/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "本庄鈴", 
              value: "https://jable.tv/models/honjou-suzu/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "樱空桃", 
              value: "https://jable.tv/models/sakura-momo/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "石川澪", 
              value: "https://jable.tv/models/a855133fa44ca5e7679cac0a0ab7d1cb/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "美ノ嶋めぐり", 
              value: "https://jable.tv/models/d1ebb3d61ee367652e6b1f35b469f2b6/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "未歩なな", 
              value: "https://jable.tv/models/c9535c2f157202cd0e934d62ef582e2e/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "凉森玲梦", 
              value: "https://jable.tv/models/7cadf3e484f607dc7d0f1c0e7a83b007/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            }
          ],
          value: "https://jable.tv/s1/models/yua-mikami/?mode=async&function=get_block&block_id=list_videos_common_videos_list",
        },
        {
          name: "sort_by",
          title: "排序",
          type: "enumeration",
          description: "排序",
          enumOptions: [
            { title: "最近更新", value: "post_date" },
            { title: "最多观看", value: "video_viewed" },
            { title: "最多收藏", value: "most_favourited" },
          ],
        },
        { name: "from", title: "页码", type: "page", description: "页码", value: "1" },
      ],
    },
    // 衣着模块
    {
      title: "衣着",
      description: "按衣着分类浏览影片",
      requiresWebView: false,
      functionName: "loadPage",
      cacheDuration: 3600,
      params: [
        {
          name: "manual_keyword",
          title: "手动搜索(填此忽略下拉)",
          type: "input",
          description: "输入标签名直接搜索",
        },
        {
          name: "url",
          title: "选择衣着",
          type: "enumeration",
          belongTo: {
            paramName: "sort_by",
            value: ["post_date","video_viewed","most_favourited"],
          },
          enumOptions: [
            { 
              title: "黑丝", 
              value: "https://jable.tv/tags/black-pantyhose/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "肉丝", 
              value: "https://jable.tv/tags/flesh-toned-pantyhose/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "丝袜", 
              value: "https://jable.tv/tags/pantyhose/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "兽耳", 
              value: "https://jable.tv/tags/kemonomimi/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "渔网", 
              value: "https://jable.tv/tags/fishnets/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "水着(泳装)", 
              value: "https://jable.tv/tags/swimsuit/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "校服(JK)", 
              value: "https://jable.tv/tags/school-uniform/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "旗袍", 
              value: "https://jable.tv/tags/cheongsam/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "婚纱", 
              value: "https://jable.tv/tags/wedding-dress/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "女僕", 
              value: "https://jable.tv/tags/maid/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "和服", 
              value: "https://jable.tv/tags/kimono/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "眼镜娘", 
              value: "https://jable.tv/tags/glasses/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "过膝袜", 
              value: "https://jable.tv/tags/knee-socks/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "运动装", 
              value: "https://jable.tv/tags/sportswear/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "兔女郎", 
              value: "https://jable.tv/tags/bunny-girl/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "Cosplay", 
              value: "https://jable.tv/tags/Cosplay/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            }
          ],
          value: "https://jable.tv/tags/black-pantyhose/?mode=async&function=get_block&block_id=list_videos_common_videos_list",
        },
        {
          name: "sort_by",
          title: "排序",
          type: "enumeration",
          description: "排序",
          enumOptions: [
            { title: "最近更新", value: "post_date" },
            { title: "最多观看", value: "video_viewed" },
            { title: "最多收藏", value: "most_favourited" },
          ],
        },
        { name: "from", title: "页码", type: "page", description: "页码", value: "1" },
      ],
    },
    // 剧情模块
    {
      title: "剧情",
      description: "按剧情分类浏览影片",
      requiresWebView: false,
      functionName: "loadPage",
      cacheDuration: 3600,
      params: [
        {
          name: "manual_keyword",
          title: "手动搜索(填此忽略下拉)",
          type: "input",
          description: "输入标签名直接搜索",
        },
        {
          name: "url",
          title: "选择剧情",
          type: "enumeration",
          belongTo: {
            paramName: "sort_by",
            value: ["post_date","video_viewed","most_favourited"],
          },
          enumOptions: [
            { 
              title: "出轨", 
              value: "https://jable.tv/tags/affair/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "NTR", 
              value: "https://jable.tv/tags/ntr/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "童贞", 
              value: "https://jable.tv/tags/virginity/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "复仇", 
              value: "https://jable.tv/tags/avenge/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "媚药", 
              value: "https://jable.tv/tags/love-potion/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "催眠", 
              value: "https://jable.tv/tags/hypnosis/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "偷拍", 
              value: "https://jable.tv/tags/private-cam/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "时间停止", 
              value: "https://jable.tv/tags/time-stop/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "颜射", 
              value: "https://jable.tv/tags/facial/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "中出", 
              value: "https://jable.tv/tags/creampie/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "多P/群交", 
              value: "https://jable.tv/tags/groupsex/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "调教", 
              value: "https://jable.tv/tags/tune/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "露出", 
              value: "https://jable.tv/tags/outdoor/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            }
          ],
          value: "https://jable.tv/tags/affair/?mode=async&function=get_block&block_id=list_videos_common_videos_list",
        },
        {
          name: "sort_by",
          title: "排序",
          type: "enumeration",
          description: "排序",
          enumOptions: [
            { title: "最近更新", value: "post_date" },
            { title: "最多观看", value: "video_viewed" },
            { title: "最多收藏", value: "most_favourited" },
          ],
        },
        { name: "from", title: "页码", type: "page", description: "页码", value: "1" },
      ],
    },
    // 角色模块
    {
      title: "角色",
      description: "按角色分类浏览影片",
      requiresWebView: false,
      functionName: "loadPage",
      cacheDuration: 3600,
      params: [
        {
          name: "manual_keyword",
          title: "手动搜索(填此忽略下拉)",
          type: "input",
          description: "输入标签名直接搜索",
        },
        {
          name: "url",
          title: "选择角色",
          type: "enumeration",
          belongTo: {
            paramName: "sort_by",
            value: ["post_date","video_viewed","most_favourited"],
          },
          enumOptions: [
            { 
              title: "人妻", 
              value: "https://jable.tv/tags/wife/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "老师", 
              value: "https://jable.tv/tags/teacher/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "护士", 
              value: "https://jable.tv/tags/nurse/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "空姐", 
              value: "https://jable.tv/tags/flight-attendant/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "学生", 
              value: "https://jable.tv/tags/school/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "女上司", 
              value: "https://jable.tv/tags/female-boss/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "风俗娘", 
              value: "https://jable.tv/tags/club-hostess-and-sex-worker/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            },
            { 
              title: "未亡人", 
              value: "https://jable.tv/tags/widow/?mode=async&function=get_block&block_id=list_videos_common_videos_list"
            }
          ],
          value: "https://jable.tv/tags/wife/?mode=async&function=get_block&block_id=list_videos_common_videos_list",
        },
        {
          name: "sort_by",
          title: "排序",
          type: "enumeration",
          description: "排序",
          enumOptions: [
            { title: "最近更新", value: "post_date" },
            { title: "最多观看", value: "video_viewed" },
            { title: "最多收藏", value: "most_favourited" },
          ],
        },
        { name: "from", title: "页码", type: "page", description: "页码", value: "1" },
      ],
    }
  ],
};

// =================== 逻辑部分 ===================

async function search(params = {}) {
  const keyword = encodeURIComponent(params.keyword || "");
  
  // 修正：将 block_id 更改为 'list_videos_common_videos_list'
  let url = `https://jable.tv/search/${keyword}/?mode=async&function=get_block&block_id=list_videos_common_videos_list&q=${keyword}`;
  
  if (params.sort_by) {
    url += `&sort_by=${params.sort_by}`;
  }
  
  if (params.from) {
    url += `&from=${params.from}`;
  }
  
  return await loadPage({ ...params, url });
}

async function loadPage(params = {}) {
  const sections = await loadPageSections(params);
  const items = sections.flatMap((section) => section.childItems);
  return items;
}

async function loadPageSections(params = {}) {
  try {
    let url = params.url;

    if (params.manual_keyword) {
      const k = encodeURIComponent(params.manual_keyword);
      // 修正：将手动输入的搜索链接 block_id 也更改为 'list_videos_common_videos_list'
      url = `https://jable.tv/search/${k}/?mode=async&function=get_block&block_id=list_videos_common_videos_list&q=${k}`;
    }

    if (!url) {
      throw new Error("地址不能为空");
    }
    if (params["sort_by"]) {
      url += `&sort_by=${params.sort_by}`;
    }
    if (params["from"]) {
      url += `&from=${params.from}`;
    }
    const response = await Widget.http.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    if (!response || !response.data || typeof response.data !== "string") {
      // 容错处理：如果返回空，可能是没有结果，返回空数组而不是抛出错误
      console.log("Empty data returned, maybe no results.");
      return [];
    }

    const htmlContent = response.data;

    return parseHtml(htmlContent);
  } catch (error) {
    console.error("加载过程出错:", error.message);
    // 尽量不抛出错误，而是返回空数组，避免APP闪退
    return [];
  }
}

async function parseHtml(htmlContent) {
  const $ = Widget.html.load(htmlContent);
  const sectionSelector = ".site-content .py-3,.pb-e-lg-40";
  const itemSelector = ".video-img-box";
  const coverSelector = "img";
  const durationSelector = ".absolute-bottom-right .label";
  const titleSelector = ".title a";

  let sections = [];
  const sectionElements = $(sectionSelector).toArray();
  
  for (const sectionElement of sectionElements) {
    const $sectionElement = $(sectionElement);
    var items = [];
    const sectionTitle = $sectionElement.find(".title-box .h3-md").first();
    const sectionTitleText = sectionTitle.text();
    const itemElements = $sectionElement.find(itemSelector).toArray();
    
    if (itemElements && itemElements.length > 0) {
      for (const itemElement of itemElements) {
        const $itemElement = $(itemElement);
        const titleId = $itemElement.find(titleSelector).first();
        const url = titleId.attr("href") || "";
        
        if (url && url.includes("jable.tv")) {
          const durationId = $itemElement.find(durationSelector).first();
          const coverId = $itemElement.find(coverSelector).first();
          const cover = coverId.attr("data-src") || coverId.attr("src");
          const video = coverId.attr("data-preview") || cover;
          const title = titleId.text();
          const duration = durationId.text().trim();
          
          const item = {
            id: url,
            type: "url",
            title: title,
            backdropPath: cover,
            previewUrl: video,
            link: url,
            mediaType: "movie",
            description: "",
            releaseDate: duration,
            playerType: "system"
          };
          items.push(item);
        }
      }
    }
    
    if (items.length > 0) {
      sections.push({
        title: sectionTitleText,
        childItems: items
      });
    }
  }
  
  // 如果外层section解析失败，尝试直接解析video-img-box（针对搜索结果页结构可能不同的情况）
  if (sections.length === 0) {
     const directItems = [];
     $(itemSelector).each((i, el) => {
        const $el = $(el);
        const titleId = $el.find(titleSelector).first();
        const url = titleId.attr("href") || "";
        if (url && url.includes("jable.tv")) {
          const durationId = $el.find(durationSelector).first();
          const coverId = $el.find(coverSelector).first();
          const cover = coverId.attr("data-src") || coverId.attr("src");
          const video = coverId.attr("data-preview") || cover;
          const title = titleId.text();
          const duration = durationId.text().trim();
          
          directItems.push({
            id: url,
            type: "url",
            title: title,
            backdropPath: cover,
            previewUrl: video,
            link: url,
            mediaType: "movie",
            description: "",
            releaseDate: duration,
            playerType: "system"
          });
        }
     });
     
     if (directItems.length > 0) {
         sections.push({ title: "搜索结果", childItems: directItems });
     }
  }
  
  return sections;
}

async function loadDetail(link) {
  const response = await Widget.http.get(link, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });
  
  // 增加正则匹配容错
  const hlsMatch = response.data.match(/var hlsUrl = '(.*?)';/);
  if (!hlsMatch) {
    throw new Error("无法获取有效的HLS URL");
  }
  const hlsUrl = hlsMatch[1];
  
  const $ = Widget.html.load(response.data);
  let videoDuration = null;
  const durationElements = $('.absolute-bottom-right .label, .duration, [class*="duration"]');
  if (durationElements.length > 0) {
    videoDuration = durationElements.first().text().trim();
  }
  
  // 解析推荐列表（猜你喜欢）
  const relatedSections = await parseHtml(response.data);
  const relatedItems = relatedSections.flatMap((section) => section.childItems);

  const item = {
    id: link,
    type: "detail",
    videoUrl: hlsUrl,
    mediaType: "movie",
    releaseDate: videoDuration,
    playerType: "system",
    customHeaders: {
      "Referer": link,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  };
  
  if (relatedItems.length > 0) {
    item.childItems = relatedItems;
  }
  
  return item;
}
