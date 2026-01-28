WidgetMetadata = {
    id: "universal_video_hub_v2",
    title: "全能影视聚合 (稳定版)",
    author: "MakkaPakka",
    description: "聚合 茶杯狐(搜索)、樱花(动漫)、LIBVIO(影视)。源更稳定。",
    version: "2.0.0",
    requiredVersion: "0.0.1",
    site: "https://libvio.app",

    modules: [
        {
            title: "全网搜片 (CupFox)",
            functionName: "loadCupFox",
            type: "video",
            params: [
                { name: "keyword", title: "搜索", type: "input", value: "庆余年" }
            ]
        },
        {
            title: "日漫追番 (樱花)",
            functionName: "loadYhdm",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                { 
                    name: "category", title: "分类", type: "enumeration", value: "japan",
                    enumOptions: [
                        { title: "日本动漫", value: "japan" },
                        { title: "国产动漫", value: "china" },
                        { title: "动漫电影", value: "movie" }
                    ]
                }
            ]
        },
        {
            title: "LIBVIO 影院",
            functionName: "loadLibvio",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                {
                    name: "type", title: "分类", type: "enumeration", value: "1",
                    enumOptions: [
                        { title: "电影", value: "1" },
                        { title: "剧集", value: "2" },
                        { title: "日韩剧", value: "15" },
                        { title: "欧美剧", value: "16" }
                    ]
                }
            ]
        }
    ]
};

// ==========================================
// 1. 茶杯狐 (CupFox)
// ==========================================
const CUPFOX_URL = "https://cupfox.app";

async function loadCupFox(params = {}) {
    const { keyword } = params;
    if (!keyword) return [{ id: "info", type: "text", title: "请输入关键词" }];

    const url = `${CUPFOX_URL}/search?key=${encodeURIComponent(keyword)}`;
    
    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1" }
        });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        $(".search-result-item").each((i, el) => {
            const $el = $(el);
            const href = $el.find("a").attr("href");
            const title = $el.find(".text-truncate").text().trim();
            const img = $el.find("img").attr("data-src") || $el.find("img").attr("src");
            
            if (href && title) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    link: href.startsWith("http") ? href : `${CUPFOX_URL}${href}`,
                    extra: { provider: "cupfox" }
                });
            }
        });
        return results;
    } catch (e) { return []; }
}

// ==========================================
// 2. 樱花动漫 (Yhdm)
// ==========================================
// 使用一个可用的镜像站
const YHDM_URL = "http://www.yinghuacd.com"; 

async function loadYhdm(params = {}) {
    const { page = 1, category = "japan" } = params;
    // 构造: http://www.yinghuacd.com/japan/2.html
    const url = `${YHDM_URL}/${category}/${page}.html`;

    try {
        const res = await Widget.http.get(url);
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        // 樱花列表结构: .lpic ul li
        $(".lpic ul li").each((i, el) => {
            const $el = $(el);
            const href = $el.find("a").attr("href");
            const title = $el.find("h2 a").text().trim();
            const img = $el.find("img").attr("src");
            const status = $el.find("span").text().trim();

            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    subTitle: status,
                    link: `${YHDM_URL}${href}`,
                    extra: { provider: "yhdm" }
                });
            }
        });
        return results;
    } catch (e) { return [{ id: "err", type: "text", title: "樱花连接失败" }]; }
}

// ==========================================
// 3. LIBVIO (影视)
// ==========================================
const LIB_URL = "https://libvio.app";

async function loadLibvio(params = {}) {
    const { page = 1, type = "1" } = params;
    // URL: https://libvio.app/show/1--------2---.html
    const url = `${LIB_URL}/show/${type}--------${page}---.html`;

    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }
        });
        const html = res.data;
        const $ = Widget.html.load(html);
        const results = [];

        // LIBVIO 结构: .stui-vodlist__box
        $(".stui-vodlist__box").each((i, el) => {
            const $el = $(el);
            const $link = $el.find("a.stui-vodlist__thumb");
            const href = $link.attr("href");
            const title = $link.attr("title");
            const img = $link.attr("data-original");
            const status = $el.find(".pic-text").text();

            if (href) {
                results.push({
                    id: href,
                    type: "link",
                    title: title,
                    coverUrl: img,
                    subTitle: status,
                    link: `${LIB_URL}${href}`,
                    extra: { provider: "libvio" }
                });
            }
        });
        return results;
    } catch (e) { return [{ id: "err", type: "text", title: "LIBVIO 连接失败" }]; }
}

// ==========================================
// 4. 全局详情解析
// ==========================================
async function loadDetail(link) {
    if (link.includes("cupfox")) return await parseCupFox(link);
    if (link.includes("yinghuacd")) return await parseYhdm(link);
    if (link.includes("libvio")) return await parseLibvio(link);
    
    return [{ id: "webview", type: "webview", title: "网页播放", link: link }];
}

// A. 茶杯狐 -> 寻找 m3u8
async function parseCupFox(link) {
    // 简单跳转，直接给 Webview 最稳，或者尝试提取
    return [{ id: link, type: "webview", title: "茶杯狐播放", link: link }];
}

// B. 樱花 -> 提取 iframe
async function parseYhdm(link) {
    try {
        const res = await Widget.http.get(link);
        const $ = Widget.html.load(res.data);
        // 樱花详情页有一个 "点击播放" 按钮指向播放页
        const playLink = $(".movurl li a").first().attr("href");
        if (playLink) {
            const fullPlay = `${YHDM_URL}${playLink}`;
            // 再次请求播放页
            const res2 = await Widget.http.get(fullPlay);
            // 提取 <div id="playbox" data-vid="...">
            const $2 = Widget.html.load(res2.data);
            const vid = $2("#playbox").attr("data-vid");
            
            // 樱花的 vid 通常就是 mp4 或 m3u8
            if (vid && vid.includes("$")) {
                const realUrl = vid.split("$")[0];
                return [{
                    id: link,
                    type: "video",
                    title: "樱花播放",
                    videoUrl: realUrl,
                    playerType: "system"
                }];
            }
        }
    } catch (e) {}
    return [{ id: "web", type: "webview", title: "网页播放", link: link }];
}

// C. LIBVIO -> 提取
async function parseLibvio(link) {
    // LIBVIO 详情页 -> 播放页
    try {
        const res = await Widget.http.get(link);
        const $ = Widget.html.load(res.data);
        const playHref = $(".stui-content__playlist a").first().attr("href");
        
        if (playHref) {
            const playUrl = `${LIB_URL}${playHref}`;
            const res2 = await Widget.http.get(playUrl);
            // LIBVIO 播放器通常在 script var player_aaaa = ...
            const match = res2.data.match(/"url":"([^"]+)"/);
            if (match) {
                const vUrl = match[1];
                if (vUrl.includes(".m3u8")) {
                    return [{
                        id: link,
                        type: "video",
                        title: "LIBVIO 播放",
                        videoUrl: vUrl,
                        playerType: "system"
                    }];
                }
            }
        }
    } catch (e) {}
    return [{ id: "web", type: "webview", title: "网页播放", link: link }];
}
