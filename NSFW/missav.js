var WidgetMetadata = {
    id: "missav_certificate_fix",
    title: "MissAV (菜单合并版)",
    description: "严格复刻原版解析逻辑，合并热门与分类菜单。",
    author: "MissAV_User",
    site: "https://missav.com",
    version: "4.0.0", // 版本号升级
    requiredVersion: "0.0.2",
    detailCacheDuration: 300,
    modules: [
        {
            title: "搜索影片",
            description: "搜索 MissAV 影片内容",
            requiresWebView: false,
            functionName: "searchVideos",
            cacheDuration: 1800,
            params: [
                {
                    name: "keyword",
                    title: "搜索关键词",
                    type: "input",
                    description: "输入番号或女优名",
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 热门榜单 (合并) ---
        {
            title: "热门榜单",
            description: "浏览各类热门排行",
            requiresWebView: false,
            functionName: "loadPage",
            cacheDuration: 1800,
            params: [
                {
                    name: "url",
                    title: "榜单类型",
                    type: "enumeration",
                    value: "https://missav.com/cn/weekly-hot",
                    enumOptions: [
                        { title: "今日热门", value: "https://missav.com/cn/today-hot" },
                        { title: "本周热门", value: "https://missav.com/cn/weekly-hot" },
                        { title: "本月热门", value: "https://missav.com/cn/monthly-hot" },
                        { title: "最新上市", value: "https://missav.com/cn/new" },
                        { title: "最近发布", value: "https://missav.com/cn/release" }
                    ]
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 分类精选 (合并) ---
        {
            title: "分类精选",
            description: "按类型筛选影片",
            requiresWebView: false,
            functionName: "loadPage",
            cacheDuration: 1800,
            params: [
                {
                    name: "url",
                    title: "分类选择",
                    type: "enumeration",
                    value: "https://missav.com/cn/chinese-subtitle",
                    enumOptions: [
                        { title: "中文字幕", value: "https://missav.com/cn/chinese-subtitle" },
                        { title: "无码流出", value: "https://missav.com/cn/uncensored-leak" },
                        { title: "FC2系列", value: "https://missav.com/cn/fc2" },
                        { title: "VR虚拟现实", value: "https://missav.com/cn/vr" },
                        { title: "个人拍摄 (Siro)", value: "https://missav.com/cn/siro" },
                        { title: "人妻", value: "https://missav.com/cn/genres/married-woman" },
                        { title: "制服", value: "https://missav.com/cn/genres/uniform" },
                        { title: "巨乳", value: "https://missav.com/cn/genres/big-tits" }
                    ]
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        }
    ]
};

// =============================================================
// 解析逻辑：100% 照搬上传的 MissAV.js
// 不做任何正则或逻辑修改，确保稳定性
// =============================================================

function extractVideoId(url) {
    if (!url) return null;
    return url.split('/').pop().split('?')[0];
}

async function parseHtml(html) {
    // 这里完全使用原版的解析方式
    const $ = Widget.html.load(html);
    const items = $('.group'); 
    const results = [];
    
    items.each((index, element) => {
        const item = $(element);
        const linkAnchor = item.find('a');
        const link = linkAnchor.attr('href');
        
        if (link) {
            const videoId = extractVideoId(link);
            const img = item.find('img');
            const title = img.attr('alt') || linkAnchor.text().trim();
            
            // 原版逻辑：手动拼接封面，避免懒加载空图
            const cover = `https://fourhoi.com/${videoId}/cover-t.jpg`;
            
            const duration = item.find('.absolute.bottom-1.right-1').text().trim();

            results.push({
                id: link,
                type: "movie",
                title: title,
                link: link,
                posterPath: cover,
                backdropPath: cover,
                releaseDate: duration,
                playerType: "system"
            });
        }
    });
    
    return results;
}

// 搜索入口
async function searchVideos(params) {
    const keyword = params.keyword;
    const page = params.page || 1;
    const url = `https://missav.com/cn/search/${encodeURIComponent(keyword)}?page=${page}`;
    
    const response = await Widget.http.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
            "Referer": "https://missav.com/"
        }
    });
    return parseHtml(response.data);
}

// 统一的页面加载入口 (用于处理热门和分类)
async function loadPage(params) {
    let url = params.url || "https://missav.com/cn/weekly-hot";
    const page = params.page || 1;
    
    // 拼接页码
    if (url.includes('?')) {
        url = `${url}&page=${page}`;
    } else {
        url = `${url}?page=${page}`;
    }
    
    // 发送请求 (严格带上 Header)
    const response = await Widget.http.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
            "Referer": "https://missav.com/"
        }
    });
    
    return parseHtml(response.data);
}

// 详情页解析 (完全保留原版 UUID 提取逻辑)
async function loadDetail(link) {
    try {
        const response = await Widget.http.get(link, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
                "Referer": link
            }
        });
        
        const html = response.data;
        const videoId = extractVideoId(link);
        const videoCode = videoId.toUpperCase().replace('-CHINESE-SUBTITLE', '').replace('-UNCENSORED-LEAK', '');
        
        let videoUrl = "";
        
        // 1. 尝试 UUID 提取 (原版逻辑)
        const uuidMatches = html.match(/uuid: "(.*?)"/);
        if (uuidMatches && uuidMatches.length > 1) {
            videoUrl = `https://surrit.com/${uuidMatches[1]}/playlist.m3u8`;
        } else {
            // 2. 备用 tm_source_id 提取 (原版逻辑)
            const matches = html.match(/tm_source_id: "(.*?)"/);
            if (matches && matches.length > 1) {
                videoUrl = `https://surrit.com/${matches[1]}/playlist.m3u8`;
            }
        }
        
        // 3. 兜底提取 (如果前面都失效，尝试正则找 .m3u8)
        if (!videoUrl) {
             const m3u8Match = html.match(/(https?:\/\/[^\s"']+\.m3u8)/);
             if (m3u8Match) videoUrl = m3u8Match[1];
        }

        return {
            id: link,
            type: "detail",
            videoUrl: videoUrl || link,
            title: videoCode,
            description: `番号: ${videoCode}`,
            posterPath: "",
            backdropPath: `https://fourhoi.com/${videoId}/cover-t.jpg`,
            mediaType: "movie",
            playerType: "system",
            link: link,
            customHeaders: videoUrl ? {
                "Referer": link,
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"
            } : undefined
        };
        
    } catch (error) {
        // 出错返回
        const videoId = extractVideoId(link);
        return {
            id: link,
            type: "detail",
            videoUrl: link,
            title: "加载错误",
            description: "请检查VPN连接",
            backdropPath: `https://fourhoi.com/${videoId}/cover-t.jpg`,
            childItems: []
        };
    }
}
