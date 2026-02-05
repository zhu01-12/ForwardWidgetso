WidgetMetadata = {
  id: "trending",
  title: "本周全球热门",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "首页轮播专用。",
  icon: "hammer.fill",
  globalParams: [],
  modules: [
    {
      type: "list",
      id: "debug_list",
      title: "本周全球热门",
      functionName: "loadSimple",
      params: [
         { name: "page", title: "页码", type: "page" }
      ]
    }
  ]
};

// 这里的 buildItem 逻辑 1:1 复制自你提供的成功代码
function buildSimpleItem(item) {
    const year = (item.first_air_date || item.release_date || "").substring(0, 4);
    return {
        id: String(item.id),
        tmdbId: parseInt(item.id),
        type: "tmdb",
        // 只有这里我加了保护，防止 undefined
        mediaType: item.media_type || (item.title ? "movie" : "tv"), 
        title: item.title || item.name,
        subTitle: `⭐ ${item.vote_average ? item.vote_average.toFixed(1) : 0}`,
        posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
        backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
        description: item.overview,
        rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
        year: year,
        genreTitle: year // 简化，不查流派了
    };
}

async function loadSimple(params) {
    const page = params.page || 1;
    try {
        // 直接调用最基础的接口
        const res = await Widget.tmdb.get("/trending/all/week", { 
            params: { language: "zh-CN", page: page } 
        });
        
        if (!res || !res.results) return [];
        
        return res.results.map(item => buildSimpleItem(item));
    } catch (e) {
        return [{ title: "调试报错", subTitle: String(e), type: "text", id: "err" }];
    }
}
