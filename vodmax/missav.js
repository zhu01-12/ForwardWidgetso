WidgetMetadata = {
    id: "missav_pro",
    title: "MissAV 浏览与播放",
    author: "MakkaPakka",
    description: "浏览 MissAV 热门视频并直接播放。",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "https://missav.com",

    modules: [
        // 模块 1: 浏览
        {
            title: "浏览视频",
            functionName: "loadList",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                { 
                    name: "category", 
                    title: "分类", 
                    type: "enumeration", 
                    value: "new",
                    enumOptions: [
                        { title: "🆕 最新发布", value: "new" },
                        { title: "🔥 本周热门", value: "weekly-hot" },
                        { title: "🌟 月度热门", value: "monthly-hot" },
                        { title: "🔞 无码流出", value: "uncensored-leak" },
                        { title: "🇯🇵 东京热", value: "tokyo-hot" },
                        { title: "📹 完整影片", value: "full" } // 很多短片，加个full筛选长片
                    ] 
                }
            ]
        }
    ]
};

const BASE_URL = "https://missav.com";

// ==========================================
// 1. 列表加载 (List)
// ==========================================
async function loadList(params = {}) {
    const { page = 1, category = "new" } = params;
    
    // 构造 URL
    // MissAV 的分页 URL 格式: https://missav.com/{category}?page={page}
    // 注意: new 对应首页或者 new
    let url = `${BASE_URL}/${category}`;
    if (page > 1) {
        url += `?page=${page}`;
    }

    console.log(`[MissAV] Fetching: ${url}`);

    try {
        const res = await Widget.http.get(url, {
            headers: { 
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
            }
        });
        
        const html = res.data;
        if (!html) return [];

        const $ = Widget.html.load(html);
        const results = [];

        // MissAV 的列表项选择器
        // 通常是 .grid .group 或者类似的 grid 布局
        // 我们查找包含 thumbnail 的 div
        $("div.group").each((i, el) => {
            const $el = $(el);
            const $link = $el.find("a.text-secondary");
            const href = $link.attr("href");
            
            if (href) {
                const title = $link.text().trim();
                const $img = $el.find("img");
                // MissAV 有懒加载，src 可能是占位符，真实图在 data-src
                const img = $img.attr("data-src") || $img.attr("src");
                const duration = $el.find(".absolute.bottom-1.right-1").text().trim(); // 时长在右下角

                results.push({
                    id: href, // 用 URL 作为 ID
                    type: "link", // 关键：设置为 link 触发 loadDetail
                    title: title,
                    coverUrl: img,
                    link: href, // 完整链接
                    description: duration, // 显示时长
                    // 额外信息
                    customHeaders: {
                        "Referer": BASE_URL
                    }
                });
            }
        });

        return results;
    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }];
    }
}

// ==========================================
// 2. 详情解析 (Detail & Play)
// ==========================================
// 当 type="link" 时，Forward 会自动调用 loadDetail
async function loadDetail(link) {
    try {
        const res = await Widget.http.get(link, {
            headers: { 
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": BASE_URL
            }
        });
        const html = res.data;

        // 核心：提取 m3u8 地址
        // MissAV 的特征是把 m3u8 放在 script 里，变量名可能是 m3u8_url, stream_url 等
        // 或者直接搜 .m3u8
        
        // 尝试匹配常见的 m3u8 模式
        // MissAV 目前常用模式: source = 'https://...'
        let m3u8Url = "";
        
        // 匹配 pattern 1: m3u8|source = "..."
        const match1 = html.match(/source\s*=\s*['"]([^'"]+\.m3u8[^'"]*)['"]/);
        if (match1) m3u8Url = match1[1];
        
        // 匹配 pattern 2: \/playlist\.m3u8
        if (!m3u8Url) {
            const match2 = html.match(/['"](https:\/\/[^'"]+\.m3u8[^'"]*)['"]/);
            if (match2) m3u8Url = match2[1];
        }

        // 解析失败
        if (!m3u8Url) {
            return [{ id: "err", type: "text", title: "解析失败", subTitle: "未找到视频地址" }];
        }

        // 提取标题和封面 (可选，用于播放器显示)
        const $ = Widget.html.load(html);
        const title = $("h1.text-base").text().trim();
        
        return [{
            id: link,
            type: "video", // 解析成功，返回 video 类型
            title: title,
            videoUrl: m3u8Url, // 播放地址
            playerType: "system", // 使用系统播放器
            customHeaders: {
                "Referer": link, // 防盗链关键
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            // 可以附带相关推荐
            // relatedItems: [...] 
        }];

    } catch (e) {
        return [{ id: "err", type: "text", title: "请求错误", subTitle: e.message }];
    }
}
