// 严格遵循 basic-widget.md 定义元数据
WidgetMetadata = {
  id: "tv.calendar.strict",
  title: "全球追剧日历",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "根据TMDB日期生成追剧日历",
  version: "2.2.4",
  requiredVersion: "0.0.1",
  site: "https://www.themoviedb.org",

    // 1. 全局参数：用户只需填一次 Key
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取数据。请在 themoviedb.org 申请。",
            value: ""
        }
    ],

    modules: [
        {
            title: "追剧日历",
            functionName: "loadTvCalendar",
            type: "video", // 使用标准 video 类型
            cacheDuration: 3600,
            params: [
                // 时间范围选择
                {
                    name: "mode",
                    title: "时间范围",
                    type: "enumeration",
                    value: "update_today",
                    enumOptions: [
                        { title: "今日更新", value: "update_today" },
                        { title: "明日首播", value: "premiere_tomorrow" },
                        { title: "7天内首播", value: "premiere_week" },
                        { title: "30天内首播", value: "premiere_month" }
                    ]
                },
                // 地区偏好选择
                {
                    name: "region",
                    title: "地区偏好",
                    type: "enumeration",
                    value: "Global",
                    enumOptions: [
                        { title: "全球聚合", value: "Global" },
                        { title: "美国 (US)", value: "US" },
                        { title: "日本 (JP)", value: "JP" },
                        { title: "韩国 (KR)", value: "KR" },
                        { title: "中国 (CN)", value: "CN" },
                        { title: "英国 (GB)", value: "GB" }
                    ]
                }
            ]
        }
    ]
};

/**
 * 核心加载函数
 */
async function loadTvCalendar(params = {}) {
    // 1. 获取全局 Key
    const apiKey = params.apiKey;
    if (!apiKey) {
        return [{
            id: "error_no_key",
            type: "text",
            title: "配置缺失",
            subTitle: "请在设置中填入 TMDB API Key"
        }];
    }

    const mode = params.mode || "update_today";
    const region = params.region || "Global";

    // 2. 计算日期范围
    const dates = calculateDates(mode);

    // 3. 确定查询模式 (首播 vs 更新)
    // premiere 模式查询 first_air_date，update 模式查询 air_date
    const isPremiere = mode.includes("premiere");
    const dateField = isPremiere ? "first_air_date" : "air_date";

    // 4. 构建 URL
    // 使用 include_null_first_air_dates=false 过滤掉未定档的剧
    let url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&sort_by=popularity.desc&include_null_first_air_dates=false&page=1&timezone=Asia/Shanghai&${dateField}.gte=${dates.start}&${dateField}.lte=${dates.end}`;

    // 5. 地区与语言逻辑
    if (region === "Global") {
        // 全球模式：优先请求中文
        url += `&language=zh-CN`;
    } else {
        // 特定地区：限制产地 + 限制原声语言 + 请求中文元数据
        url += `&language=zh-CN&with_origin_country=${region}`;
        
        // 智能语言锁定：避免在日本区刷出美版翻拍动画
        const langMap = { "JP": "ja", "KR": "ko", "CN": "zh", "GB": "en", "US": "en" };
        if (langMap[region]) {
            url += `&with_original_language=${langMap[region]}`;
        }
    }

    console.log(`[Calendar] Request: ${url}`);

    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;

        if (!data.results || data.results.length === 0) {
            return [{
                id: "empty_result",
                type: "text",
                title: "暂无更新",
                subTitle: `${region} 在 ${dates.start} 无数据`
            }];
        }

        // 6. 数据映射
        return data.results.map(item => {
            // 标题逻辑：优先 name (中文)，其次 original_name (原文)
            const displayName = item.name || item.original_name;
            const originalName = item.original_name || "";
            
            // 日期逻辑
            const dateStr = item[dateField] || ""; // e.g., "2023-10-25"
            const shortDate = dateStr.slice(5);    // e.g., "10-25"

            // 构造标题前缀 (无 Emoji)
            // 如果是“今日更新”，不需要显示日期，用户默认知道是今天
            // 如果是“未来首播”，显示 "10-25 | 剧名"
            let finalTitle = displayName;
            if (mode !== "update_today" && shortDate) {
                finalTitle = `${shortDate} | ${displayName}`;
            }

            // 构造副标题
            // 如果原名和显示名不同，显示原名；否则显示简介
            const subTitle = (originalName && originalName !== displayName) 
                ? originalName 
                : (item.overview || "暂无简介");

            return {
                id: String(item.id),
                type: "tmdb",
                tmdbId: parseInt(item.id),
                mediaType: "tv",

                title: finalTitle,
                subTitle: subTitle,

                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",

                rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
                year: (item.first_air_date || "").substring(0, 4)
            };
        });

    } catch (e) {
        console.error(e);
        return [{
            id: "error_network",
            type: "text",
            title: "网络错误",
            subTitle: e.message || "请求失败"
        }];
    }
}

// 日期计算工具
function calculateDates(mode) {
    const today = new Date();
    const toStr = (d) => d.toISOString().split('T')[0];

    if (mode === "update_today") {
        return { start: toStr(today), end: toStr(today) };
    }

    if (mode === "premiere_tomorrow") {
        const tmr = new Date(today);
        tmr.setDate(today.getDate() + 1);
        return { start: toStr(tmr), end: toStr(tmr) };
    }

    if (mode === "premiere_week") {
        const start = new Date(today);
        start.setDate(today.getDate() + 1);
        const end = new Date(today);
        end.setDate(today.getDate() + 7);
        return { start: toStr(start), end: toStr(end) };
    }

    if (mode === "premiere_month") {
        const start = new Date(today);
        start.setDate(today.getDate() + 1);
        const end = new Date(today);
        end.setDate(today.getDate() + 30);
        return { start: toStr(start), end: toStr(end) };
    }

    return { start: toStr(today), end: toStr(today) };
}
