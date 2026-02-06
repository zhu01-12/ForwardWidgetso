var WidgetMetadata = {
    id: "missav_merged_ui",
    title: "MissAV (UI合并版)",
    description: "基于可用核心逻辑，合并热门与分类菜单。",
    author: "MissAV_User",
    site: "https://missav.com",
    version: "2.1.0",
    requiredVersion: "0.0.2",
    detailCacheDuration: 0,
    modules: [
        {
            title: "搜索影片",
            description: "搜索番号或关键词",
            requiresWebView: false,
            functionName: "searchVideos",
            cacheDuration: 300,
            params: [
                {
                    name: "keyword",
                    title: "关键词",
                    type: "input",
                    description: "请输入番号",
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        {
            title: "热门榜单",
            description: "浏览各类热门排行",
            requiresWebView: false,
            functionName: "loadPage",
            cacheDuration: 3600,
            params: [
                {
                    name: "url",
                    title: "榜单类型",
                    type: "enumeration",
                    enumOptions: [
                        { title: "今日热门", value: "https://missav.com/cn/today-hot" },
                        { title: "本周热门", value: "https://missav.com/cn/weekly-hot" },
                        { title: "本月热门", value: "https://missav.com/cn/monthly-hot" },
                        { title: "最新更新", value: "https://missav.com/cn/new" },
                        { title: "最近发布", value: "https://missav.com/cn/release" }
                    ],
                    value: "https://missav.com/cn/weekly-hot"
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        {
            title: "分类精选",
            description: "按类型浏览",
            requiresWebView: false,
            functionName: "loadPage",
            cacheDuration: 3600,
            params: [
                {
                    name: "url",
                    title: "分类选择",
                    type: "enumeration",
                    enumOptions: [
                        { title: "中文字幕", value: "https://missav.com/cn/chinese-subtitle" },
                        { title: "无码流出", value: "https://missav.com/cn/uncensored-leak" },
                        { title: "FC2系列", value: "https://missav.com/cn/fc2" },
                        { title: "VR虚拟现实", value: "https://missav.com/cn/vr" },
                        { title: "个人拍摄 (Siro)", value: "https://missav.com/cn/siro" },
                        { title: "18-19岁", value: "https://missav.com/cn/genres/18-19-year-old" }, // 示例分类
                        { title: "制服 (Costume)", value: "https://missav.com/cn/genres/uniform" },
                        { title: "巨乳 (Body)", value: "https://missav.com/cn/genres/big-tits" }
                    ],
                    value: "https://missav.com/cn/chinese-subtitle"
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        }
    ]
};

// =============================================================
// 以下代码逻辑完全照搬自你上传的 MissAV.js (Butterfly版)
// =============================================================

var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15";

function extractVideoId(url) {
    if (!url) return "";
    var parts = url.split("/");
    return parts[parts.length - 1].split("?")[0];
}

// 核心解析函数：完全保留原正则逻辑，不使用 DOM 解析器
async function parseHtml(html) {
    var items = [];
    
    // 原模块使用的正则逻辑（非常简单直接）
    // 寻找包含 href 的 a 标签区域
    // 注意：这里我们使用正则全局匹配来模拟原模块的行为
    
    // 匹配 div class="group" ...
    var regex = /<div class="[^"]*group[^"]*">([\s\S]*?)<\/div>/g;
    var match;
    
    while ((match = regex.exec(html)) !== null) {
        var content = match[1];
        
        // 提取链接
        var hrefMatch = content.match(/href="([^"]+)"/);
        var href = hrefMatch ? hrefMatch[1] : "";
        
        if (href && (href.includes("/cn/") || href.includes("missav.com"))) {
            // 提取标题
            var titleMatch = content.match(/alt="([^"]+)"/);
            var title = titleMatch ? titleMatch[1] : "";
            if (!title) {
                // 备用标题提取
                 var textMatch = content.match(/<a[^>]*>([\s\S]*?)<\/a>/);
                 title = textMatch ? textMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            }

            // 提取时长
            var durationMatch = content.match(/<span class="[^"]*absolute bottom[^"]*">([\s\S]*?)<\/span>/);
            var duration = durationMatch ? durationMatch[1].trim() : "";

            var videoId = extractVideoId(href);
            
            // 核心：强制使用 fourhoi 拼接图片，防止 List Error
            var cover = "https://fourhoi.com/" + videoId + "/cover-m.jpg";
            
            // 简单去重
            var exists = false;
            for(var k=0; k<items.length; k++) {
                if (items[k].id === href) { exists = true; break; }
            }
            
            if (!exists) {
                items.push({
                    id: href,
                    type: "movie",
                    title: title,
                    link: href,
                    backdropPath: cover,
                    posterPath: cover,
                    releaseDate: duration,
                    playerType: "system"
                });
            }
        }
    }
    
    return items;
}

// 搜索功能 (保留原逻辑)
async function searchVideos(params) {
    var keyword = params.keyword;
    var page = params.page || 1;
    
    var url = "https://missav.com/cn/search/" + encodeURIComponent(keyword) + "?page=" + page;
    
    try {
        var res = await Widget.http.get(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://missav.com/"
            }
        });
        return await parseHtml(res.data);
    } catch (e) {
        return [];
    }
}

// 页面加载功能 (支持通过 url 参数调用)
async function loadPage(params) {
    // 兼容处理：既支持直接传参，也支持从 params.url 获取
    var url = params.url || "https://missav.com/cn/weekly-hot";
    var page = params.page || 1;
    
    // 拼接页码
    var finalUrl = url;
    if (finalUrl.indexOf("?") > -1) {
        finalUrl += "&page=" + page;
    } else {
        finalUrl += "?page=" + page;
    }

    try {
        var res = await Widget.http.get(finalUrl, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": "https://missav.com/"
            }
        });
        return await parseHtml(res.data);
    } catch (e) {
        return [];
    }
}

// 详情页功能 (完全保留原逻辑)
async function loadDetail(link) {
    try {
        var res = await Widget.http.get(link, {
            headers: {
                "User-Agent": USER_AGENT,
                "Referer": link
            }
        });
        var html = res.data;
        var videoId = extractVideoId(link);
        var videoCode = videoId.toUpperCase();

        var videoUrl = "";
        
        // 1. 正则匹配 m3u8
        var m3u8Regex = /(https?:\/\/[a-z0-9\-\.]+\/[a-z0-9\-\.\/_]+\.m3u8[a-z0-9\-\.\/_?=&]*)/i;
        var match = html.match(m3u8Regex);
        if (match && match[1]) {
            videoUrl = match[1];
        }

        // 2. UUID 匹配
        if (!videoUrl) {
            var uuidMatch = html.match(/uuid\s*:\s*['"]([a-f0-9\-]+)['"]/i);
            if (uuidMatch && uuidMatch[1]) {
                videoUrl = "https://surrit.com/" + uuidMatch[1] + "/playlist.m3u8";
            }
        }
        
        // 3. 兜底
        if (!videoUrl) {
            videoUrl = "https://surrit.com/" + videoId + "/playlist.m3u8";
        }

        return {
            id: link,
            type: "detail",
            title: videoCode,
            description: "番号: " + videoCode,
            videoUrl: videoUrl,
            mediaType: "movie",
            playerType: "system",
            backdropPath: "https://fourhoi.com/" + videoId + "/cover-m.jpg",
            customHeaders: {
                "Referer": link,
                "User-Agent": USER_AGENT
            },
            childItems: [] // 简化处理，避免详情页再解析列表出错
        };

    } catch (e) {
        var videoId = extractVideoId(link);
        return {
            id: link,
            type: "detail",
            title: "Error",
            videoUrl: "",
            backdropPath: "https://fourhoi.com/" + videoId + "/cover-m.jpg",
            childItems: []
        };
    }
}
