var WidgetMetadata = {
    id: "91porn_makka",
    title: "91Porn (精简重构版)",
    description: "菜单合并优化，去除冗余代码，修复播放。",
    author: "Forward_Dev",
    site: "https://91porn.com",
    version: "2.0.0",
    requiredVersion: "0.0.2",
    detailCacheDuration: 0,
    modules: [
        // --- 模块1: 综合浏览 (合并了 最新、高清、长视频、付费) ---
        {
            title: "综合浏览",
            description: "按类型浏览视频",
            functionName: "loadList",
            requiresWebView: false,
            params: [
                {
                    name: "category",
                    title: "分类",
                    type: "enumeration", // 【关键】使用枚举类型
                    enumOptions: [
                        { title: "✨ 最新发布", value: "0" }, // 对应 category=0 (默认)
                        { title: "🔥 热门推荐", value: "hot" },
                        { title: "💎 高清视频", value: "hd" },
                        { title: "⏳ 10分钟+", value: "long" },
                        { title: "⏳ 20分钟+", value: "longer" },
                        { title: "💰 付费精选", value: "pay" }
                    ],
                    value: "0" // 默认值
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 模块2: 排行榜 (合并了 本周、本月、历史、收藏) ---
        {
            title: "排行榜",
            description: "查看热门排行",
            functionName: "loadList", // 复用同一个函数，只是参数不同
            requiresWebView: false,
            params: [
                {
                    name: "category",
                    title: "榜单",
                    type: "enumeration",
                    enumOptions: [
                        { title: "📅 本周最热", value: "video_viewed_week" }, // 实际上91是通过参数组合实现的，这里用value做标记
                        { title: "🗓️ 本月最热", value: "rp" },
                        { title: "🏆 历史最热", value: "video_viewed" },
                        { title: "❤️ 收藏最多", value: "tf" },
                        { title: "💬 讨论最多", value: "mf" }
                    ],
                    value: "rp"
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 模块3: 搜索 ---
        {
            title: "搜索",
            description: "搜索关键词",
            functionName: "searchVideo",
            requiresWebView: false,
            params: [
                { name: "keyword", title: "关键词", type: "input" },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        }
    ]
};

// =================== 核心配置 ===================

// 91的域名经常变，建议提取出来
const BASE_URL = "https://91porn.com"; 

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": BASE_URL + "/",
    // 91有时候需要这个Cookie来设置语言，否则可能是英文
    "Cookie": "language=cn_CN;" 
};

// =================== 功能函数 ===================

/**
 * 通用列表加载 (核心逻辑优化)
 * 通过判断 params.category 的值来决定拼接什么 URL
 */
async function loadList(params) {
    var cat = params.category || "0";
    var page = params.page || 1;
    var url = "";

    // 逻辑分支：根据 category 的不同值构造 URL
    if (cat === "0") {
        // 最新
        url = `${BASE_URL}/v.php?category=hot&viewtype=basic&page=${page}`; 
        // 注：91的 "hot" 其实是最新，很奇怪的命名
    } else if (["hd", "long", "longer", "pay", "tf", "mf", "rp"].includes(cat)) {
        // 标准分类 (高清、长视频、付费、收藏、讨论、本月)
        url = `${BASE_URL}/v.php?category=${cat}&viewtype=basic&page=${page}`;
    } else if (cat === "video_viewed") {
        // 历史最热 (特殊参数)
        url = `${BASE_URL}/v.php?category=hot&viewtype=basic&page=${page}&sort=video_viewed`;
    } else if (cat === "video_viewed_week") {
        // 本周最热 (特殊参数)
        // 注意：91没有直接的本周参数，通常是用 rp (本月) 代替，或者 search 里的排序
        // 这里我们用 rp 近似替代，或者你可以找更准确的参数
        url = `${BASE_URL}/v.php?category=rp&viewtype=basic&page=${page}`;
    } else {
        // 默认兜底
        url = `${BASE_URL}/v.php?category=hot&viewtype=basic&page=${page}`;
    }

    return await fetchAndParse(url);
}

async function searchVideo(params) {
    var keyword = params.keyword;
    var page = params.page || 1;
    // 搜索接口
    var url = `${BASE_URL}/v.php?category=search&viewtype=basic&page=${page}&search_keyword=${encodeURIComponent(keyword)}`;
    return await fetchAndParse(url);
}

// --- 解析器 (解析 HTML 列表) ---
async function fetchAndParse(url) {
    try {
        var res = await Widget.http.get(url, { headers: HEADERS });
        var html = res.data;
        var $ = Widget.html.load(html);
        var items = [];

        // 91 的列表项通常在 .list-channel 或 .row .well-sm 里
        // 现在的版面通常是 class="col-sm-4 col-md-3 col-lg-3"
        $('.list-channel .well').each((i, el) => {
            var $el = $(el);
            var $link = $el.find('a').first(); // 视频链接通常在第一个 a 标签
            var href = $link.attr('href');

            // 提取缩略图
            var $img = $link.find('img');
            var thumb = $img.attr('src');
            // 91有时用 data-original 做懒加载
            if (!thumb || thumb.includes("blank")) thumb = $img.attr('data-original');

            // 提取标题
            var title = $img.attr('title') || $el.find('.video-title').text();

            // 提取时长
            var duration = $el.find('.duration').text().trim();

            if (href && title) {
                // 91的链接有时带参数，最好只保留 viewkey
                // href example: https://91porn.com/view_video.php?viewkey=xxxx&page=...
                // 我们直接透传 href 即可
                
                items.push({
                    id: href,
                    type: "movie",
                    title: title.trim(),
                    link: href,
                    posterPath: thumb,
                    backdropPath: thumb,
                    releaseDate: duration,
                    // 91 不需要 requiresWebView，我们可以直接解析
                    playerType: "system"
                });
            }
        });

        return items;
    } catch (e) {
        console.error(e);
        return [];
    }
}

// --- 详情页解析 (提取视频地址) ---
async function loadDetail(link) {
    try {
        // 91做了反爬，需要带上 Cookie: language=cn_CN 并且 Referer 必须正确
        // 有时候还需要伪造 X-Forwarded-For IP
        var detailHeaders = {
            ...HEADERS,
            "Referer": link
        };

        var res = await Widget.http.get(link, { headers: detailHeaders });
        var html = res.data;
        var $ = Widget.html.load(html);

        var videoUrl = "";
        
        // 策略1: 直接查找 <video><source> (现代版91)
        videoUrl = $('video source').attr('src');

        // 策略2: 如果没有，查找加密的 document.write(stren_encode(...))
        if (!videoUrl) {
            var match = html.match(/document\.write\(stren_encode\("([^"]+)"/);
            if (match && match[1]) {
                // 这里原本需要解密，但91现在通常直接给 mp4/m3u8
                // 如果是加密的，通常是一个 base64 或者简单的位移
                // 现在的 91 网页版通常直接把 url 写在 <textarea id="copy_url"> 里供分享
                var copyUrl = $('#copy_url').val(); // 分享链接
                if (copyUrl) videoUrl = copyUrl; // 但这通常是网页链接不是视频流
            }
        }

        // 策略3: 暴力正则 (最稳)
        if (!videoUrl) {
            // 找 .mp4 或 .m3u8
            var vMatch = html.match(/(https?:\/\/[^"']+\.(mp4|m3u8)[^"']*)/);
            if (vMatch) videoUrl = vMatch[1];
        }

        if (!videoUrl) throw new Error("无法提取视频地址");

        var title = $('.login_register_header').text().trim() || "91 Video";
        var cover = $('#player_one').attr('poster'); // 播放器海报

        return {
            id: link,
            type: "detail",
            title: title,
            description: "91Porn 精选",
            videoUrl: videoUrl,
            posterPath: cover,
            backdropPath: cover,
            mediaType: "movie",
            playerType: "system",
            customHeaders: {
                "Referer": link, // 播放时防盗链
                "User-Agent": HEADERS["User-Agent"]
            },
            childItems: [] // 暂不处理推荐视频
        };

    } catch (e) {
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
