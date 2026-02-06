var WidgetMetadata = {
    id: "douban_hot_fixed_v2",
    title: "豆瓣热播 (修复版)",
    description: "热播剧/综艺/动漫/纪录片 (Mac UA)",
    author: "Forward_User",
    site: "https://movie.douban.com",
    version: "2.0.0",
    requiredVersion: "0.0.2",
    detailCacheDuration: 300,
    modules: [
        {
            title: "剧集与综艺",
            description: "浏览豆瓣各类热播榜单",
            functionName: "fetchDoubanList",
            requiresWebView: false,
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

// 严格执行你的要求：使用 Mac 电脑的 UA
var MAC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://movie.douban.com/explore",
    "X-Requested-With": "XMLHttpRequest"
};

async function fetchDoubanList(params) {
    var category = params.category || "tv_hot";
    var page = parseInt(params.page) || 1;
    var start = (page - 1) * 20;

    // 1. 将你提供的手机链接逻辑，映射为 Mac 电脑端对应的 Tag
    // 这些是豆瓣 PC 端 API 的标准 Tag，与你的手机链接内容完全一致
    var tag = "热门"; 
    var type = "tv";  // 豆瓣把综艺也归类在 TV 接口下

    if (category === "tv_hot") { tag = "热门"; }
    else if (category === "tv_domestic") { tag = "国产剧"; }
    else if (category === "tv_american") { tag = "美剧"; }
    else if (category === "tv_japanese") { tag = "日剧"; }
    else if (category === "tv_korean") { tag = "韩剧"; }
    else if (category === "tv_animation") { tag = "日本动画"; } // 豆瓣"动漫"主分类通常指日本动画，也可改为"动画"
    else if (category === "tv_documentary") { tag = "纪录片"; }
    
    else if (category === "show_hot") { tag = "综艺"; }
    else if (category === "show_domestic") { tag = "国产综艺"; }
    else if (category === "show_foreign") { tag = "国外综艺"; }

    // 2. 构建 PC 端 API 请求
    // 这是豆瓣电脑网页版加载这些列表时调用的真实接口
    var url = "https://movie.douban.com/j/search_subjects?type=" + type + 
              "&tag=" + encodeURIComponent(tag) + 
              "&sort=recommend&page_limit=20&page_start=" + start;

    try {
        var res = await Widget.http.get(url, { headers: MAC_HEADERS });
        var json = JSON.parse(res.data);
        var items = [];

        if (json.subjects) {
            for (var i = 0; i < json.subjects.length; i++) {
                var item = json.subjects[i];
                // 3. 格式化数据
                items.push({
                    title: item.title,
                    subTitle: "评分: " + item.rate,
                    posterPath: item.cover,
                    link: item.url,
                    type: "url" // 点击跳转浏览器查看
                });
            }
        }
        return items;
    } catch (e) {
        // 如果出错，返回提示
        return [{ title: "加载失败", subTitle: "请检查网络或稍后重试", type: "text" }];
    }
}
