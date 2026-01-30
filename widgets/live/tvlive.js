WidgetMetadata = {
    id: "universal_m3u_player_pro_v2",
    title: "万能直播源 (修复版)",
    author: "Makkapakka",
    description: "V1.2 修复：解决预览能播但全屏提示无资源的问题。强制小写Headers，优化ID结构。",
    version: "1.2.0",
    requiredVersion: "0.0.1",
    site: "https://github.com/2kuai/ForwardWidgets",

    modules: [
        {
            title: "直播源列表",
            functionName: "loadM3uList",
            type: "list",
            cacheDuration: 3600, 
            params: [
                {
                    name: "m3uUrl",
                    title: "直播源链接 (.m3u)",
                    type: "input",
                    description: "粘贴你的 M3U 链接",
                    value: "" 
                },
                {
                    name: "userAgent",
                    title: "User-Agent (伪装)",
                    type: "input",
                    description: "用于绕过源服务器限制",
                    // 默认填入你提供的可用 UA
                    value: "AptvPlayer/1.4.17" 
                },
                {
                    name: "keyword",
                    title: "搜索/过滤",
                    type: "input",
                    description: "筛选频道名或分组"
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                }
            ]
        }
    ]
};

// =========================================================================
// 1. 核心逻辑
// =========================================================================

async function loadM3uList(params = {}) {
    const { m3uUrl, keyword, userAgent = "AptvPlayer/1.4.17", page = 1 } = params;

    if (!m3uUrl) {
        return [{ id: "tip", type: "text", title: "请先填写直播源链接" }];
    }

    // 1. 构造统一的小写 Headers (关键修复)
    // 许多播放器内核只认小写 header key
    const safeHeaders = { 
        "user-agent": userAgent,
        "referer": m3uUrl 
    };

    try {
        // 下载列表时也使用伪装 UA
        const res = await Widget.http.get(m3uUrl, { headers: safeHeaders });
        const content = res.data || res || "";
        
        if (!content || typeof content !== "string") {
            return [{ id: "err", type: "text", title: "解析失败", subTitle: "源返回数据为空" }];
        }

        // 2. 解析 M3U
        let channels = parseM3uPlus(content);

        if (channels.length === 0) {
            if (content.includes("http")) channels = parseSimpleList(content);
            if (channels.length === 0) {
                return [{ id: "empty", type: "text", title: "未解析到频道", subTitle: "请检查链接格式" }];
            }
        }

        // 3. 过滤
        if (keyword) {
            const lowerKw = keyword.toLowerCase();
            channels = channels.filter(ch => 
                (ch.name && ch.name.toLowerCase().includes(lowerKw)) || 
                (ch.group && ch.group.toLowerCase().includes(lowerKw))
            );
        }

        // 4. 分页
        const pageSize = 20;
        const total = channels.length;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        if (start >= total) return [];
        const pageItems = channels.slice(start, end);

        // 5. 构建 Forward Item
        return pageItems.map((ch, index) => {
            let sub = "";
            if (ch.group) sub += `📂 ${ch.group}`;
            
            const defaultLogo = "https://img.icons8.com/color/144/000000/tv-show.png";
            
            // 💡 修复点 2: 使用安全的 ID (页码_索引)，避免 URL 特殊字符导致跳转失败
            const safeId = `live_${page}_${index}`;

            return {
                id: safeId, 
                type: "url", 
                
                // 封面播放用的地址
                videoUrl: ch.url, 
                
                title: ch.name || "未知直播间",
                subTitle: sub,
                posterPath: ch.logo || defaultLogo, 
                description: `分组: ${ch.group || "默认"}\n地址: ${ch.url}`,
                
                // 💡 修复点 1: Headers 全小写，且直接传给 Item
                customHeaders: safeHeaders,

                // 💡 修复点 3: 显式添加 childItems
                // 这样进入详情页后，会显示一个“默认线路”的列表项
                // 即使封面播放失败，点击列表项通常能成功，因为它是独立的资源对象
                childItems: [
                    {
                        id: safeId + "_source",
                        title: "默认线路", // 详情页里显示的名称
                        type: "url",
                        videoUrl: ch.url,
                        customHeaders: safeHeaders
                    }
                ]
            };
        });

    } catch (e) {
        return [{ id: "err", type: "text", title: "加载出错", subTitle: e.message }];
    }
}

// =========================================================================
// 2. 解析器 (保持不变)
// =========================================================================

function parseM3uPlus(content) {
    const lines = content.split('\n');
    const channels = [];
    let currentChannel = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            currentChannel = {};
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            if (logoMatch) currentChannel.logo = logoMatch[1];

            const groupMatch = line.match(/group-title="([^"]*)"/);
            if (groupMatch) currentChannel.group = groupMatch[1];

            const nameMatch = line.match(/,([^,]*)$/);
            if (nameMatch) {
                currentChannel.name = nameMatch[1].trim();
            } else {
                const parts = line.split(',');
                if (parts.length > 1) currentChannel.name = parts[parts.length - 1].trim();
            }
        } 
        else if (!line.startsWith('#')) {
            if (currentChannel) {
                currentChannel.url = line;
                channels.push(currentChannel);
                currentChannel = null;
            } else {
                if (line.startsWith('http') || line.startsWith('rtmp')) {
                     channels.push({ name: "直播频道", url: line, group: "未分类" });
                }
            }
        }
    }
    return channels;
}

function parseSimpleList(content) {
    const lines = content.split('\n');
    const channels = [];
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('http') || line.startsWith('rtmp')) {
            channels.push({ name: "直播频道", url: line, group: "自动识别" });
        }
    }
    return channels;
}
