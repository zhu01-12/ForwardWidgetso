var WidgetMetadata = {
    id: "douban_rexxar_final",
    title: "豆瓣热播 (Rexxar版)",
    description: "完全复刻可用代码逻辑，使用移动端接口。",
    author: "Forward_User",
    site: "https://m.douban.com",
    version: "3.0.0",
    requiredVersion: "0.0.2",
    detailCacheDuration: 300,
    modules: [
        {
            title: "剧集与综艺",
            description: "浏览热播剧集与综艺",
            functionName: "fetchDoubanList",
            requiresWebView: false, // 接口直连，不需要 WebView
            params: [
                {
                    name: "category",
                    title: "选择榜单",
                    type: "enumeration",
                    enumOptions: [
                        // --- 剧集类 ---
                        { title: "🔥 热播剧·综合", value: "tv_hot" },
                        { title: "🇨🇳 热播剧·国产", value: "tv_domestic" },
                        { title: "🇺🇸 热播剧·欧美", value: "tv_american" },
                        { title: "🇯🇵 热播剧·日剧", value: "tv_japanese" },
                        { title: "🇰🇷 热播剧·韩剧", value: "tv_korean" },
                        { title: "🧸 热播剧·动漫", value: "tv_animation" },
                        { title: "🎥 热播剧·纪录片", value: "tv_documentary" },
                        // --- 综艺类 ---
                        { title: "🎤 热播综艺·综合", value: "show_hot" },
                        { title: "🏮 热播综艺·国内", value: "show_domestic" },
                        { title: "🌍 热播综艺·国外", value: "show_foreign" }
                    ],
                    value: "tv_hot"
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        }
    ]
};

// =================== 核心逻辑 ===================

async function fetchDoubanList(params) {
    var category = params.category || "tv_hot";
    var page = parseInt(params.page) || 1;
    // 豆瓣 Rexxar 接口每页数量通常为 18 或 20
    var count = 18; 
    var start = (page - 1) * count;

    // 1. 构造 Rexxar API 地址
    // 这是你上传的代码中“剧集推荐”真正调用的接口格式
    // 对应链接: https://m.douban.com/rexxar/api/v2/subject_collection/{category}/items
    var url = `https://m.douban.com/rexxar/api/v2/subject_collection/${category}/items?start=${start}&count=${count}`;

    // 2. 构造 Headers (关键！)
    // 必须模仿 Referer，否则豆瓣会报 403 Forbidden
    var headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": `https://m.douban.com/subject_collection/${category}`,
        "X-Requested-With": "XMLHttpRequest"
    };

    try {
        var res = await Widget.http.get(url, { headers: headers });
        var json = JSON.parse(res.data);
        var items = [];

        // Rexxar 接口返回的数据在 subject_collection_items 数组里
        var list = json.subject_collection_items;

        if (list && list.length > 0) {
            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                // 确保数据有效
                if (item && item.title) {
                    var title = item.title;
                    var subTitle = "";
                    
                    // 处理评分
                    if (item.rating && item.rating.value) {
                        subTitle = "评分: " + item.rating.value;
                    } else {
                        subTitle = item.card_subtitle || ""; // 备用副标题
                    }

                    // 处理图片 (有些在 cover.url，有些在 pic.normal)
                    var img = "";
                    if (item.cover && item.cover.url) img = item.cover.url;
                    else if (item.pic && item.pic.normal) img = item.pic.normal;

                    // 处理链接 (Rexxar返回的 url 通常是 m.douban.com，我们可以转回 www 或者直接用)
                    var link = item.url || `https://movie.douban.com/subject/${item.id}/`;

                    items.push({
                        title: title,
                        subTitle: subTitle,
                        posterPath: img,
                        link: link,
                        type: "url" // 跳转浏览器
                    });
                }
            }
        }
        return items;

    } catch (e) {
        console.log("Error fetching douban: " + e.message);
        return [{ title: "接口请求失败", subTitle: "请检查网络或稍后重试", type: "text" }];
    }
}
