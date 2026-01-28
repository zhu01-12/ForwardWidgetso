WidgetMetadata = {
    id: "midnight_hub_ultimate",
    title: "午夜剧场 | 聚合版",
    author: "MakkaPakka",
    description: "聚合 Jable(JAV)、Netflav(欧美/亚)、Hanime1(里番)。支持直连播放。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://jable.tv",

    // 0. 全局免 Key
    globalParams: [],

    modules: [
        // 模块 1: Jable
        {
            title: "Jable (JAV综合)",
            functionName: "loadJable",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                { 
                    name: "category", title: "分类", type: "enumeration", value: "hot",
                    enumOptions: [
                        { title: "🔥 热门影片", value: "hot" },
                        { title: "🆕 最新发布", value: "new-release" },
                        { title: "🇨🇳 中文字幕", value: "categories/chinese-subtitle" },
                        { title: "🔞 无码流出", value: "categories/uncensored" }
                    ] 
                },
                {
                    name: "sort", title: "排序", type: "enumeration", value: "video_viewed",
                    enumOptions: [
                        { title: "最多观看", value: "video_viewed" },
                        { title: "最近更新", value: "post_date" },
                        { title: "最多收藏", value: "most_favourited" }
                    ]
                }
            ]
        },
        // 模块 2: Netflav
        {
            title: "Netflav (网飞风)",
            functionName: "loadNetflav",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                {
                    name: "type", title: "类型", type: "enumeration", value: "all",
                    enumOptions: [
                        { title: "全部影片", value: "all" },
                        { title: "中文字幕", value: "chinese-subs" },
                        { title: "无码破解", value: "uncensored" },
                        { title: "欧美精选", value: "western" }
                    ]
                }
            ]
        },
        // 模块 3: Hanime1
        {
            title: "Hanime1 (里番)",
            functionName: "loadHanime1",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                {
                    name: "genre", title: "分类", type: "enumeration", value: "latest",
                    enumOptions: [
                        { title: "📅 最新上传", value: "latest" },
                        { title: "🔥 本月热门", value: "monthly" },
                        { title: "🏆 总榜排行", value: "alltime" }
                    ]
                }
            ]
        }
    ]
};

// =========================================================================
// 1. Jable (基于之前的验证版)
// =========================================================================
const JABLE_URL = "https://jable.tv";

async function loadJable(params = {}) {
    const { page = 1, category = "hot", sort = "video_viewed" } = params;
    
    // Jable 分页参数是 from
    let url = `${JABLE_URL}/${category}/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=${sort}&from=${page}`;

    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" }
        });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $(".video-img-box").each((i, el) => {
            const $el = $(el);
            const href = $el.find("a").attr("href");
            const title = $el.find(".title").text().trim();
            const img = $el.find("img").attr("data-src") || $el.find("img").attr("src");
            const duration = $el.find(".label").text().trim();

            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    link: href,
                    subTitle: duration,
                    extra: { provider: "jable" }
                });
            }
        });
        return results;
    } catch (e) { return [{ id: "err", type: "text", title: "Jable 加载失败" }]; }
}

// =========================================================================
// 2. Netflav (API)
// =========================================================================
const NETFLAV_API = "https://netflav.com/api/video/getList";

async function loadNetflav(params = {}) {
    const { page = 1, type = "all" } = params;
    
    // Netflav API 参数
    // type: all, chinese-subs, uncensored, western
    let apiUrl = `${NETFLAV_API}?page=${page}&type=${type}`;
    
    try {
        const res = await Widget.http.get(apiUrl, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const data = res.data?.result?.docs || [];
        
        return data.map(item => ({
            id: item._id,
            type: "link",
            title: item.title,
            coverUrl: item.preview_url, // 预览图
            link: `https://netflav.com/video?id=${item.videoId}`,
            subTitle: item.source_date || "", // 日期
            description: `番号: ${item.videoId}`,
            extra: { provider: "netflav" }
        }));
    } catch (e) { return [{ id: "err", type: "text", title: "Netflav API 失败" }]; }
}

// =========================================================================
// 3. Hanime1 (Scraper)
// =========================================================================
const HANIME_URL = "https://hanime1.me";

async function loadHanime1(params = {}) {
    const { page = 1, genre = "latest" } = params;
    
    // URL 构造
    let url = "";
    if (genre === "latest") url = `${HANIME_URL}/?page=${page}`;
    else if (genre === "monthly") url = `${HANIME_URL}/previews/2024?page=${page}`; // 示例
    else url = `${HANIME_URL}/search?sort=views&time=all&page=${page}`; // 总榜

    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $(".col-xs-6").each((i, el) => {
            const $el = $(el);
            const $link = $el.find("a").first();
            const href = $link.attr("href");
            const title = $el.find(".home-rows-videos-title").text().trim();
            const img = $el.find("img").attr("src");
            const author = $el.find(".home-rows-videos-author").text().trim();

            if (href && title) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    link: href,
                    description: author,
                    extra: { provider: "hanime1" }
                });
            }
        });
        return results;
    } catch (e) { return [{ id: "err", type: "text", title: "Hanime1 加载失败" }]; }
}

// =========================================================================
// 4. 全局详情解析 (Router)
// =========================================================================

async function loadDetail(link) {
    if (link.includes("jable.tv")) return await parseJable(link);
    if (link.includes("netflav")) return await parseNetflav(link);
    if (link.includes("hanime1")) return await parseHanime1(link);
    
    return [{ id: "web", type: "webview", title: "网页播放", link: link }];
}

// A. Jable 解析 (复用之前成功的逻辑)
async function parseJable(link) {
    try {
        const res = await Widget.http.get(link);
        const match = res.data.match(/var hlsUrl = '([^']+)';/);
        if (match && match[1]) {
            return [{
                id: link,
                type: "video",
                title: "Jable 播放",
                videoUrl: match[1],
                playerType: "system",
                customHeaders: { "Referer": link } // 必须
            }];
        }
    } catch (e) {}
    return [{ id: "err", type: "text", title: "解析失败" }];
}

// B. Netflav 解析
async function parseNetflav(link) {
    try {
        // Netflav 网页源码里通常直接包含 <video> src
        const res = await Widget.http.get(link);
        const html = res.data;
        
        // 尝试提取 m3u8
        // 模式: "src":"https://...m3u8"
        const match = html.match(/"src":"([^"]+\.m3u8[^"]*)"/);
        if (match) {
            const m3u8 = match[1].replace(/\\/g, ""); // 去除转义
            return [{
                id: link,
                type: "video",
                title: "Netflav 播放",
                videoUrl: m3u8,
                playerType: "system"
            }];
        }
    } catch (e) {}
    // Netflav 经常变，如果直连失败，返回 WebView
    return [{ id: "web", type: "webview", title: "Netflav 网页播放", link: link }];
}

// C. Hanime1 解析
async function parseHanime1(link) {
    try {
        const res = await Widget.http.get(link);
        const html = res.data;
        const $ = Widget.html.load(html);
        
        // Hanime1 的视频源在 <video id="player"> <source src="...">
        const videoSrc = $("#player source").attr("src");
        
        if (videoSrc) {
            return [{
                id: link,
                type: "video",
                title: $("h3").first().text().trim(),
                videoUrl: videoSrc,
                playerType: "system"
            }];
        }
    } catch (e) {}
    return [{ id: "web", type: "webview", title: "Hanime1 网页播放", link: link }];
}
