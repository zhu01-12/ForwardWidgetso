var WidgetMetadata = {
    id: "douban_extract_v1",
    title: "豆瓣精选 (TMDB独立版)",
    description: "从豆瓣获取高质量片单/推荐/偏好",
    author: "Forward_User",
    site: "https://m.douban.com",
    version: "1.0.0",
    requiredVersion: "0.0.2",
    detailCacheDuration: 300,
    modules: [
        // --- 1. 豆瓣片单 (自定义输入) ---
        {
            title: "豆瓣片单 (TMDB版)",
            description: "输入豆瓣片单ID获取数据",
            functionName: "loadSubjectCollection",
            requiresWebView: false,
            params: [
                {
                    name: "id",
                    title: "片单ID",
                    type: "input",
                    description: "例如: movie_hot_gaia, tv_american"
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 2. 剧集推荐 (预设分类) ---
        {
            title: "剧集推荐 (TMDB版)",
            description: "浏览各类热播剧集",
            functionName: "loadSubjectCollection", // 复用核心函数
            requiresWebView: false,
            params: [
                {
                    name: "id",
                    title: "分类",
                    type: "enumeration",
                    enumOptions: [
                        { title: "🔥 热门剧集", value: "tv_hot" },
                        { title: "🇨🇳 国产剧", value: "tv_domestic" },
                        { title: "🇺🇸 英美剧", value: "tv_american" },
                        { title: "🇯🇵 日剧", value: "tv_japanese" },
                        { title: "🇰🇷 韩剧", value: "tv_korean" },
                        { title: "🧸 动漫", value: "tv_animation" },
                        { title: "🎤 综艺", value: "show_hot" }
                    ],
                    value: "tv_hot"
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 3. 电影推荐 (预设分类) ---
        {
            title: "电影推荐 (TMDB版)",
            description: "浏览各类热门电影",
            functionName: "loadSubjectCollection", // 复用核心函数
            requiresWebView: false,
            params: [
                {
                    name: "id",
                    title: "分类",
                    type: "enumeration",
                    enumOptions: [
                        { title: "🔥 热门电影 (Gaia)", value: "movie_hot_gaia" },
                        { title: "🎬 院线热映", value: "movie_showing" },
                        { title: "🌟 高分榜", value: "movie_top250" },
                        { title: "📅 近期热门", value: "movie_latest" },
                        { title: "🎥 冷门佳片", value: "movie_cold_quality" }
                    ],
                    value: "movie_hot_gaia"
                },
                { name: "page", title: "页码", type: "page", value: "1" }
            ]
        },
        // --- 4. 观影偏好 (个性化推荐) ---
        {
            title: "观影偏好 (TMDB版)",
            description: "基于算法的个性化推荐",
            functionName: "loadRecommendation",
            requiresWebView: false,
            params: [
                // 如果需要更精准的推荐，可以在这里加 Cookie 参数，不填则为游客推荐
                // { name: "cookie", title: "Cookie (可选)", type: "input" },
                { name: "refresh", title: "刷新", type: "page", value: "1" } // 用页码参数来触发刷新
            ]
        }
    ]
};

// =================== 核心逻辑 (Rexxar API) ===================

// 使用移动端 UA 和 Referer，这是数据获取成功的关键
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    "Referer": "https://m.douban.com/movie",
    "X-Requested-With": "XMLHttpRequest"
};

/**
 * 核心函数 1: 加载片单 (Subject Collection)
 * 对应你说的“剧集推荐”、“电影推荐”、“豆瓣片单”
 */
async function loadSubjectCollection(params) {
    var collectionId = params.id;
    var page = parseInt(params.page) || 1;
    var count = 18; // Rexxar 默认每页数量
    var start = (page - 1) * count;

    if (!collectionId) return [];

    // Rexxar 接口: subject_collection
    var url = `https://m.douban.com/rexxar/api/v2/subject_collection/${collectionId}/items?start=${start}&count=${count}`;

    try {
        var res = await Widget.http.get(url, { headers: HEADERS });
        var json = JSON.parse(res.data);
        var items = [];

        // 数据在 subject_collection_items 数组中
        var list = json.subject_collection_items;
        if (list) {
            items = list.map(item => parseDoubanItem(item)).filter(i => i != null);
        }
        return items;
    } catch (e) {
        console.log("Collection Error: " + e.message);
        return [{ title: "加载失败", subTitle: "请检查ID或网络", type: "text" }];
    }
}

/**
 * 核心函数 2: 加载观影偏好 (Recommendation Feed)
 * 对应你说的“观影偏好”，即豆瓣的推荐流
 */
async function loadRecommendation(params) {
    // 推荐流接口
    var url = `https://m.douban.com/rexxar/api/v2/recommend_feed?alt=json&next_date=&loc_id=108288&gender=&birthday=&udid=9f1092792f9a65662768407481a5661793739763&for_mobile=1`;
    
    // 如果有 Cookie，推荐会更精准，否则是游客推荐
    var headers = { ...HEADERS };
    /* if (params.cookie) {
        headers["Cookie"] = params.cookie;
    } 
    */

    try {
        var res = await Widget.http.get(url, { headers: headers });
        var json = JSON.parse(res.data);
        var items = [];

        // 数据在 recommend_feeds 数组中
        var list = json.recommend_feeds;
        if (list) {
            items = list.map(item => parseDoubanItem(item)).filter(i => i != null);
        }
        return items;
    } catch (e) {
        console.log("Recommend Error: " + e.message);
        return [{ title: "推荐获取失败", type: "text" }];
    }
}

/**
 * 通用解析函数
 * 负责把 Rexxar 复杂的 JSON 转换成 Forward 能识别的格式
 */
function parseDoubanItem(item) {
    if (!item || !item.title) return null;

    // 1. 标题
    var title = item.title;

    // 2. 评分与副标题
    var subTitle = "";
    if (item.rating && item.rating.value) {
        subTitle = "⭐ " + item.rating.value;
    } else if (item.null_rating_reason) {
        subTitle = item.null_rating_reason;
    }
    
    // 叠加额外信息 (年份/国家)
    if (item.year) subTitle += " | " + item.year;
    if (item.card_subtitle) subTitle += " | " + item.card_subtitle;

    // 3. 图片 (处理 Rexxar 多种图片格式)
    var img = "";
    if (item.cover && item.cover.url) img = item.cover.url;
    else if (item.pic && item.pic.normal) img = item.pic.normal;
    else if (item.pic && item.pic.large) img = item.pic.large;

    // 4. 链接
    // Rexxar 返回的 url 也是 m.douban.com，我们可以直接用
    var link = item.url;
    if (!link && item.id) {
        // 如果没有 url 字段，尝试根据 type 拼接
        var type = item.type || "movie";
        link = `https://movie.douban.com/subject/${item.id}/`;
    }

    // 5. 格式化输出 (关键：格式必须对)
    return {
        title: title,
        subTitle: subTitle,
        posterPath: img,
        link: link,
        // 这里设置为 url，点击跳转浏览器，这是最稳的
        // 如果设置为 douban，App 可能会尝试去匹配，但也可能报错，用 url 绝对不出错
        type: "url" 
    };
}
