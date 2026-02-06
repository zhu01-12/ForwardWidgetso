var WidgetMetadata = {
    id: "missav_merged_mak",
    title: "MissAV",
    description: "获取 MissAV 推荐 (菜单合并版)",
    author: "\ud835\udcd1\ud835\udcfe\ud835\udcfd\ud835\udcfd\ud835\udcee\ud835\udcfb\ud835\udcef\ud835\udcf5\ud835\udd02",
    site: "https://for-ward.vercel.app",
    version: "1.0.1",
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
                    description: "输入番号或关键词",
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 合并后的热门榜单 ---
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
                        { title: "最新发布", value: "https://missav.com/cn/new" },
                        { title: "无码流出", value: "https://missav.com/cn/uncensored-leak" }
                    ]
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 合并后的分类精选 ---
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
                        { title: "FC2系列", value: "https://missav.com/cn/fc2" },
                        { title: "VR虚拟现实", value: "https://missav.com/cn/vr" },
                        { title: "个人拍摄", value: "https://missav.com/cn/siro" },
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

// ============================================================
// 逻辑部分：完全保留原版写法，确保网络请求不报错
// ============================================================

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

// 统一加载函数，支持从菜单传入不同的 URL
async function loadPage(params) {
    // 兼容逻辑：params.url 是下拉菜单选中的值
    var url = params.url || "https://missav.com/cn/weekly-hot";
    var page = params.page || 1;
    
    // 简单的字符串拼接
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
            description: "番号: " + videoCode,
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
            title: "解析错误",
            description: "Error",
            backdropPath: "https://fourhoi.com/" + videoId + "/cover-t.jpg",
            childItems: []
        };
    }
}
