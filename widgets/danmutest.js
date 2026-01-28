async function getCommentsById(params) {
    const { commentId } = params;
    // 假设 getServersFromParams 是外部定义的函数，如果报错请确保该函数存在
    const servers = typeof getServersFromParams === 'function' ? getServersFromParams(params) : [];

    if (!commentId) return null;
    if (!servers || servers.length === 0) return null;

    const headers = {
        "Content-Type": "application/json",
        "User-Agent": "ForwardWidgets/1.0.0",
    };

    // 1. 并发请求所有服务器
    // 保留 chConvert=1 参数以支持繁简转换
    const tasks = servers.map(async (server) => {
        try {
            const url = `${server}/api/v2/comment/${commentId}?withRelated=true&chConvert=1`;
            const res = await Widget.http.get(url, { headers });
            
            // 兼容处理：有些接口直接返回对象，有些返回字符串需解析
            let data = res.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch(e) {}
            }
            return data;
        } catch (e) {
            console.error(`Danmu fetch error from ${server}:`, e);
            return null;
        }
    });

    const results = await Promise.all(tasks);

    // 2. 数据合并与去重
    let baseStructure = null; // 用于保留非弹幕的其他字段（如关联视频信息）
    const allDanmakus = [];
    const seen = new Set();

    results.forEach((data) => {
        if (!data) return;

        // 保留第一个包含有效结构的响应作为基础对象
        if (!baseStructure && (data.danmakus || data.comments)) {
            baseStructure = data;
        }

        // 提取弹幕列表（兼容 danmakus 和 comments 两个字段名）
        const list = Array.isArray(data.danmakus) ? data.danmakus : 
                     (Array.isArray(data.comments) ? data.comments : []);

        if (!list || list.length === 0) return;

        list.forEach((d) => {
            // 生成唯一指纹：优先用 cid/id，没有则用 内容+时间点 组合
            // 这种写法能有效防止不同源返回的同一条弹幕重复出现
            const key = (d.cid !== undefined ? `cid:${d.cid}` : "") || 
                        (d.id !== undefined ? `id:${d.id}` : "") || 
                        `mix:${d.time || d.p || ""}#${d.text || d.m || ""}`;
            
            if (seen.has(key)) return;
            seen.add(key);
            allDanmakus.push(d);
        });
    });

    // 3. 返回结果
    if (!baseStructure && allDanmakus.length === 0) {
        return null; // 所有源都失败
    }

    // 如果没有获取到基础结构（极其罕见），手动构造一个
    if (!baseStructure) {
        baseStructure = { code: 0 };
    }

    // 将去重后的总弹幕列表回填
    // 优先使用 danmakus 字段，符合 Forward 规范
    baseStructure.danmakus = allDanmakus;
    
    // 清理可能存在的旧字段以防混淆
    if (baseStructure.comments) delete baseStructure.comments;

    return baseStructure;
}
