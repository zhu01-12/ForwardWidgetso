// 默认内置你的 GitHub 源地址
const DEFAULT_SOURCE_URL = "https://raw.githubusercontent.com/MakkaPakka518/ForwardWidgets/refs/heads/main/tv.json";

const CHINESE_NUM_MAP = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
};

WidgetMetadata = {
  id: "vod_stream_Max",
  title: "VOD Max",
  icon: "https://assets.vvebo.vip/scripts/icon.png",
  version: "1.0.2",
  requiredVersion: "0.0.1",
  description: "为你的Forward提供VOD资源",
  author: "𝙈𝙖𝙠𝙠𝙖 ℙ𝕒𝕜𝕜𝕒",
  site: "https://github.com/MakkaPakka518/ForwardWidgets",
  globalParams: [
    {
      name: "multiSource",
      title: "是否启用聚合搜索",
      type: "enumeration",
      enumOptions: [
        { title: "启用", value: "enabled" },
        { title: "禁用", value: "disabled" }
      ]
    },
    {
      name: "VodData",
      title: "源配置 (JSON/CSV内容 或 在线URL)",
      type: "input",
      value: DEFAULT_SOURCE_URL // 这里直接使用你的链接
    }
  ],
  modules: [
    {
      id: "loadResource",
      title: "加载资源",
      functionName: "loadResource",
      type: "stream",
      params: [],
    }
  ],
};

// --- 辅助工具函数 ---

const isM3U8Url = (url) => url?.toLowerCase().includes('m3u8') || false;

function extractSeasonInfo(seriesName) {
  if (!seriesName) return { baseName: seriesName, seasonNumber: 1 };
  const chineseMatch = seriesName.match(/第([一二三四五六七八九十\d]+)[季部]/);
  if (chineseMatch) {
    const val = chineseMatch[1];
    const seasonNum = CHINESE_NUM_MAP[val] || parseInt(val) || 1;
    const baseName = seriesName.replace(/第[一二三四五六七八九十\d]+[季部]/, '').trim();
    return { baseName, seasonNumber: seasonNum };
  }
  const digitMatch = seriesName.match(/(.+?)(\d+)$/);
  if (digitMatch) {
    return { baseName: digitMatch[1].trim(), seasonNumber: parseInt(digitMatch[2]) || 1 };
  }
  return { baseName: seriesName.trim(), seasonNumber: 1 };
}

function extractPlayInfoForCache(item, siteTitle, type) {
  const { vod_name, vod_play_url, vod_play_from, vod_remarks = '' } = item;
  if (!vod_name || !vod_play_url) return [];

  const playSources = vod_play_url.replace(/#+$/, '').split('$$$');
  const sourceNames = (vod_play_from || '').split('$$$');
  
  return playSources.flatMap((playSource, i) => {
    const sourceName = sourceNames[i] || '默认源';
    const isTV = playSource.includes('#');
    const results = [];

    if (type === 'tv' && isTV) {
      const episodes = playSource.split('#').filter(Boolean);
      episodes.forEach(ep => {
        const [epName, url] = ep.split('$');
        if (url && isM3U8Url(url)) {
          const epMatch = epName.match(/第(\d+)集/);
          results.push({
            name: siteTitle,
            description: `${vod_name} - ${epName}${vod_remarks ? ' - ' + vod_remarks : ''} - [${sourceName}]`,
            url: url.trim(),
            _ep: epMatch ? parseInt(epMatch[1]) : null
          });
        }
      });
    } else if (type === 'movie' && !isTV) {
      const firstM3U8 = playSource.split('#').find(v => isM3U8Url(v.split('$')[1]));
      if (firstM3U8) {
        const [quality, url] = firstM3U8.split('$');
        const qualityText = quality.toLowerCase().includes('tc') ? '抢先版' : '正片';
        results.push({
          name: siteTitle,
          description: `${vod_name} - ${qualityText} - [${sourceName}]`,
          url: url.trim()
        });
      }
    }
    return results;
  });
}

// 核心修改：支持解析 文本内容 或 转换后的对象
function parseResourceSites(content) {
  // 如果已经是对象（JSON解析后），直接处理
  if (typeof content === 'object') {
     // 兼容不同的JSON格式 key: name/title/key, url/value/api
     return (Array.isArray(content) ? content : []).map(s => ({ 
        title: s.name || s.title || s.key, 
        value: s.url || s.value || s.api 
     })).filter(s => s.title && s.value);
  }

  // 如果是字符串
  const trimmed = String(content || "").trim();
  
  try {
    // 尝试解析JSON字符串
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      return JSON.parse(trimmed).map(s => ({ 
          title: s.name || s.title || s.key, 
          value: s.url || s.value || s.api 
      })).filter(s => s.title && s.value);
    }
    // 尝试解析CSV (逗号分隔)
    return trimmed.split('\n').map(line => {
      const [title, value] = line.split(',').map(s => s.trim());
      if (title && value?.startsWith('http')) {
        return { title, value: value.endsWith('/') ? value : value + '/' };
      }
      return null;
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// --- 主入口函数 ---

async function loadResource(params) {
  const { seriesName, type = 'tv', season, episode, multiSource, VodData } = params;
  
  if (multiSource !== "enabled" || !seriesName) return [];

  // 1. 获取源配置 (新增：支持在线URL获取)
  let rawSourceData = VodData;
  
  // 如果输入的是 http 开头的链接，先去下载内容
  if (rawSourceData && rawSourceData.trim().startsWith("http")) {
      try {
          const res = await Widget.http.get(rawSourceData.trim());
          rawSourceData = res.data; // 获取到的可能是 JSON 对象或字符串
      } catch (e) {
          console.error("在线源获取失败");
          return [];
      }
  }

  const resourceSites = parseResourceSites(rawSourceData);
  if (resourceSites.length === 0) return []; // 无有效源

  const { baseName, seasonNumber } = extractSeasonInfo(seriesName);
  const targetSeason = season ? parseInt(season) : seasonNumber;
  const targetEpisode = episode ? parseInt(episode) : null;

  // 2. 尝试从缓存获取
  const cacheKey = `vod_exact_cache_${baseName}_s${targetSeason}_${type}`;
  let allResources = [];
  
  try {
    const cached = Widget.storage.get(cacheKey);
    if (cached && Array.isArray(cached)) {
      console.log(`命中缓存: ${cacheKey}`);
      allResources = cached;
    }
  } catch (e) {}

  // 3. 如果没有缓存，则发起网络请求
  if (allResources.length === 0) {
    const fetchTasks = resourceSites.map(async (site) => {
      try {
        const response = await Widget.http.get(site.value, {
          params: { ac: "detail", wd: baseName.trim() },
          timeout: 10000 
        });
        const list = response?.data?.list;
        if (!Array.isArray(list)) return [];

        return list.flatMap(item => {
          const itemInfo = extractSeasonInfo(item.vod_name);
          
          if (itemInfo.baseName !== baseName || itemInfo.seasonNumber !== targetSeason) {
            return [];
          }
          
          return extractPlayInfoForCache(item, site.title, type);
        });
      } catch (error) {
        return [];
      }
    });

    const results = await Promise.all(fetchTasks);
    const merged = results.flat();

    // URL 去重
    const urlSet = new Set();
    allResources = merged.filter(res => {
      if (urlSet.has(res.url)) return false;
      urlSet.add(res.url);
      return true;
    });

    // 写入缓存
    if (allResources.length > 0) {
      try { Widget.storage.set(cacheKey, allResources, 10800); } catch (e) {}
    }
  }

  // 4. 结果返回
  if (type === 'tv' && targetEpisode !== null) {
    return allResources.filter(res => {
      if (res._ep !== undefined && res._ep !== null) {
        return res._ep === targetEpisode;
      }
      return res.description.includes(`第${targetEpisode}集`);
    });
  }

  return allResources;
}
