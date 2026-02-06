var WidgetMetadata = {
    id: "missav_merged_safe",
    title: "MissAVtest",
    description: "\u83b7\u53d6 MissAV \u63a8\u8350", // "获取 MissAV 推荐"
    author: "\ud835\udcd1\ud835\udcfe\ud835\udcfd\ud835\udcfd\ud835\udcee\ud835\\udcfb\ud835\udcef\ud835\udcf5\ud835\udd02",
    site: "https://for-ward.vercel.app", // 保持原版 site
    version: "3.0.0",
    requiredVersion: "0.0.2",
    detailCacheDuration: 300,
    modules: [
        {
            title: "\u641c\u7d22\u5f71\u7247", // "搜索影片"
            description: "\u641c\u7d22 MissAV \u5f71\u7247\u5185\u5bb9",
            requiresWebView: false,
            functionName: "searchVideos",
            cacheDuration: 1800,
            params: [
                {
                    name: "keyword",
                    title: "\u641c\u7d22\u5173\u952e\u8bcd", // "搜索关键词"
                    type: "input",
                    description: "\u8f93\u5165\u756a\u53f7\u6216\u5973\u4f18\u540d", // "输入番号或女优名"
                },
                { name: "page", title: "\u9875\u7801", type: "page", value: "1" } // "页码"
            ]
        },
        // --- 合并后的热门榜单 (中文已转义) ---
        {
            title: "\u70ed\u95e8\u699c\u5355", // "热门榜单"
            description: "\u6d4f\u89c8\u5404\u7c7b\u70ed\u95e8\u6392\u884c", // "浏览各类热门排行"
            requiresWebView: false,
            functionName: "loadPage",
            cacheDuration: 1800,
            params: [
                {
                    name: "url",
                    title: "\u699c\u5355\u7c7b\u578b", // "榜单类型"
                    type: "enumeration",
                    value: "https://missav.com/cn/weekly-hot",
                    enumOptions: [
                        { title: "\u4eca\u65e5\u70ed\u95e8", value: "https://missav.com/cn/today-hot" }, // 今日热门
                        { title: "\u672c\u5468\u70ed\u95e8", value: "https://missav.com/cn/weekly-hot" }, // 本周热门
                        { title: "\u672c\u6708\u70ed\u95e8", value: "https://missav.com/cn/monthly-hot" }, // 本月热门
                        { title: "\u6700\u65b0\u4e0a\u5e02", value: "https://missav.com/cn/new" }, // 最新上市
                        { title: "\u6700\u8fd1\u53d1\u5e03", value: "https://missav.com/cn/release" }  // 最近发布
                    ]
                },
                { name: "page", title: "\u9875\u7801", type: "page", value: "1" }
            ]
        },
        // --- 合并后的分类精选 (中文已转义) ---
        {
            title: "\u5206\u7c7b\u7cbe\u9009", // "分类精选"
            description: "\u6309\u7c7b\u578b\u7b5b\u9009\u5f71\u7247", // "按类型筛选影片"
            requiresWebView: false,
            functionName: "loadPage",
            cacheDuration: 1800,
            params: [
                {
                    name: "url",
                    title: "\u5206\u7c7b\u9009\u62e9", // "分类选择"
                    type: "enumeration",
                    value: "https://missav.com/cn/chinese-subtitle",
                    enumOptions: [
                        { title: "\u4e2d\u6587\u5b57\u5e55", value: "https://missav.com/cn/chinese-subtitle" }, // 中文字幕
                        { title: "\u65e0\u7801\u6d41\u51fa", value: "https://missav.com/cn/uncensored-leak" }, // 无码流出
                        { title: "FC2\u7cfb\u5217", value: "https://missav.com/cn/fc2" }, // FC2系列
                        { title: "VR\u865a\u62df\u73b0\u5b9e", value: "https://missav.com/cn/vr" }, // VR虚拟现实
                        { title: "\u4e2a\u4eba\u62cd\u6444 (Siro)", value: "https://missav.com/cn/siro" }, // 个人拍摄
                        { title: "\u4eba\u59bb", value: "https://missav.com/cn/genres/married-woman" }, // 人妻
                        { title: "\u5236\u670d", value: "https://missav.com/cn/genres/uniform" }, // 制服
                        { title: "\u5de8\u4e73", value: "https://missav.com/cn/genres/big-tits" }, // 巨乳
                        { title: "\u4e2d\u51fa", value: "https://missav.com/cn/genres/creampie" }, // 中出
                        { title: "\u989c\u5c04", value: "https://missav.com/cn/genres/facial" } // 颜射
                    ]
                },
                { name: "page", title: "\u9875\u7801", type: "page", value: "1" }
            ]
        }
    ]
};

// =============================================================
// 以下逻辑 100% 照搬原版 MissAV.js (Butterfly版)
// 不做任何逻辑修改，确保稳定性
// =============================================================

function extractVideoId(url) {
    if (!url) return null;
    var parts = url.split('/');
    var lastPart = parts.pop();
    return lastPart.split('?')[0];
}

async function searchVideos(params) {
    var keyword = params.keyword;
    var page = params.page || 1;
    var url = "https://missav.com/cn/search/" + encodeURIComponent(keyword) + "?page=" + page;
    
    var response = await Widget.http.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"
        }
    });
    
    return parseHtml(response.data);
}

// 这是一个通用的加载函数，用于处理“热门榜单”和“分类精选”的下拉菜单
async function loadPage(params) {
    // 获取下拉菜单选中的 URL
    var url = params.url || "https://missav.com/cn/weekly-hot";
    var page = params.page || 1;
    
    if (url.indexOf('?') > -1) {
        url = url + "&page=" + page;
    } else {
        url = url + "?page=" + page;
    }
    
    var response = await Widget.http.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"
        }
    });
    return parseHtml(response.data);
}

async function parseHtml(html) {
    var $ = Widget.html.load(html);
    var items = $('.group');
    var results = [];
    
    items.each((index, element) => {
        var item = $(element);
        var linkAnchor = item.find('a');
        var link = linkAnchor.attr('href');
        
        if (link) {
            var videoId = extractVideoId(link);
            var img = item.find('img');
            var title = img.attr('alt');
            if (!title) {
                title = linkAnchor.text().trim();
            }
            
            var cover = "https://fourhoi.com/" + videoId + "/cover-t.jpg";
            var duration = item.find('.absolute.bottom-1.right-1').text().trim();

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

async function loadDetail(link) {
    try {
        var response = await Widget.http.get(link, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
                "Referer": link
            }
        });
        
        var html = response.data;
        var videoId = extractVideoId(link);
        var videoCode = videoId.toUpperCase().replace('-CHINESE-SUBTITLE', '').replace('-UNCENSORED-LEAK', '');
        
        var videoUrl = "";
        
        var uuidMatches = html.match(/uuid: "(.*?)"/);
        if (uuidMatches && uuidMatches.length > 1) {
            videoUrl = "https://surrit.com/" + uuidMatches[1] + "/playlist.m3u8";
        } else {
            var matches = html.match(/tm_source_id: "(.*?)"/);
            if (matches && matches.length > 1) {
                videoUrl = "https://surrit.com/" + matches[1] + "/playlist.m3u8";
            }
        }
        
        return {
            id: link,
            type: "detail",
            videoUrl: videoUrl || link,
            title: videoCode,
            description: "\u756a\u53f7: " + videoCode, // "番号: "
            posterPath: "",
            backdropPath: "https://fourhoi.com/" + videoId + "/cover-t.jpg",
            mediaType: "movie",
            playerType: "system",
            link: link,
            customHeaders: videoUrl ? {
                "Referer": link,
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"
            } : undefined
        };
        
    } catch (error) {
        var videoId = extractVideoId(link);
        return {
            id: link,
            type: "detail",
            videoUrl: link,
            title: "\u89e3\u6790\u9519\u8bef", // "解析错误"
            description: "Error",
            backdropPath: "https://fourhoi.com/" + videoId + "/cover-t.jpg",
            childItems: []
        };
    }
}
