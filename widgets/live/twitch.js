WidgetMetadata = {
  id: "twitch_local_direct",
  title: "Twitch 直播 (本地直连)",
  author: "Me",
  description: "不依赖服务器，利用手机网络直接解析 Twitch 直播流。",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  site: "https://twitch.tv",
  
  // 这里配置你想看的默认主播列表
  globalParams: [
      { 
          name: "defaultChannels", 
          title: "默认主播ID (逗号分隔)", 
          type: "input", 
          value: "shroud,tarik,tenz,zneptunelive,seoi1016,fps_shaka,uzi" 
      }
  ],

  modules: [
    {
      title: "我的关注",
      functionName: "loadFollowedChannels",
      type: "list",
      cacheDuration: 0, // 直播不缓存
      params: []
    },
    {
        title: "搜索主播",
        functionName: "searchStreamer",
        type: "list",
        params: [
            { name: "channelId", title: "主播ID (如 shroud)", type: "input", value: "" }
        ]
    }
  ]
};

// ===========================
// 主逻辑
// ===========================

// 1. 加载默认列表
async function loadFollowedChannels(params) {
    const defaultStr = params.defaultChannels || "shroud,tarik,tenz";
    const channels = defaultStr.split(",").map(s => s.trim()).filter(Boolean);
    
    // 并发获取所有频道状态
    const promises = channels.map(id => getStreamItem(id));
    const results = await Promise.all(promises);
    
    // 过滤掉完全错误的，保留在线和离线的（离线显示为灰色或提示）
    return results.filter(item => item !== null);
}

// 2. 搜索单个主播
async function searchStreamer(params) {
    if (!params.channelId) return [{ title: "请输入主播 ID", type: "text" }];
    const item = await getStreamItem(params.channelId);
    return item ? [item] : [{ title: "未找到频道或解析失败", type: "text" }];
}

// ===========================
// 核心解析函数
// ===========================

async function getStreamItem(channelId) {
    const channel = channelId.toLowerCase();
    
    try {
        // 1. 构造请求获取 Token
        // 使用 Android TV Client ID，抗封锁能力最强
        const clientId = "kd1unb4r3yd4jf6tbze5f7h6j197mw";
        
        const gqlQuery = {
            operationName: "PlaybackAccessToken",
            variables: {
                isLive: true,
                login: channel,
                isVod: false,
                vodID: "",
                playerType: "frontpage"
            },
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: "0828119ded1c1347796643485968c200c26939681ef14ad046379208eb2477e3"
                }
            }
        };

        const res = await Widget.http.post("https://gql.twitch.tv/gql", {
            headers: {
                "Client-ID": clientId,
                "Content-Type": "application/json",
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SHIELD Android TV Build/PPR1.180610.011)"
            },
            body: JSON.stringify(gqlQuery)
        });

        // 检查 Token
        const data = res.data || JSON.parse(res.body); // 兼容不同版本的 HTTP 库
        const accessToken = data.data?.streamPlaybackAccessToken;

        // 构造基础 UI 信息
        const baseItem = {
            title: channel.toUpperCase(),
            subTitle: "检测中...",
            // 封面图使用 Twitch 缓存图
            posterPath: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel}-640x360.jpg?t=${Date.now()}`, 
            type: "tmdb", // 借用样式
            mediaType: "tv"
        };

        if (!accessToken) {
            // 频道可能被封禁或 ID 错误
            baseItem.subTitle = "❌ 频道不存在";
            return baseItem;
        }

        const token = accessToken.value;
        const sig = accessToken.signature;

        if (!token || !sig) {
            // 离线状态（Twitch 不会给离线频道发 Token，或者返回 null）
            baseItem.subTitle = "⚫ 离线 (Offline)";
            // 也可以选择不返回离线主播： return null; 
            return baseItem; 
        }

        // 2. 构造最终播放链接
        const streamUrl = `https://usher.ttvnw.net/api/channel/hls/${channel}.m3u8?allow_source=true&allow_audio_only=true&allow_spectre=false&player=twitchweb&playlist_include_framerate=true&segment_preference=4&sig=${sig}&token=${encodeURIComponent(token)}`;

        // 3. 返回可播放对象
        return {
            id: channel,
            title: channel.toUpperCase(),
            subTitle: "🔴 直播中 (点击播放)",
            genreTitle: "Twitch Live",
            description: "点击即可直接播放。如果无法播放，请检查 VPN 连接。",
            posterPath: baseItem.posterPath,
            videoUrl: streamUrl, // Forward 识别此字段播放
            type: "tmdb", // 使用美观的卡片布局
            mediaType: "tv",
            playerType: "system", // 调用系统播放器
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Referer": "https://www.twitch.tv/"
            }
        };

    } catch (e) {
        return {
            title: channel,
            subTitle: "⚠️ 解析错误",
            description: e.message,
            type: "text"
        };
    }
}
