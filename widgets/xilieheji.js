WidgetMetadata = {
  id: "franchise.binge.pro",
  title: "系列电影大满贯",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "一键获取 哈利波特/漫威 等系列电影或者手动搜索的系列电影的完整观看顺序",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "系列合集",
      functionName: "loadFranchise",
      type: "list",
      requiresWebView: false,
      params: [
        // 1. API Key
        {
          name: "apiKey",
          title: "TMDB API Key (必填)",
          type: "input",
          description: "必须填写",
        },
        // 2. 预设合集 (顶级 IP)
        {
          name: "presetId",
          title: "选择系列",
          type: "enumeration",
          value: "custom",
          enumOptions: [
            { title: "🔍 自定义搜索 (手动输入)", value: "custom" },
            { title: "哈利波特 (Harry Potter)", value: "1241" },
            { title: "007 詹姆斯邦德 (James Bond)", value: "645" },
            { title: "指环王 (Lord of the Rings)", value: "119" },
            { title: "星球大战 (Star Wars)", value: "10" },
            { title: "速度与激情 (Fast & Furious)", value: "9485" },
            { title: "碟中谍 (Mission: Impossible)", value: "87359" },
            { title: "复仇者联盟 (The Avengers)", value: "86311" },
            { title: "蝙蝠侠 (Batman 1989-1997)", value: "2952" },
            { title: "黑暗骑士 (Nolan Batman)", value: "263" },
            { title: "加勒比海盗 (Pirates)", value: "295" },
            { title: "疾速追杀 (John Wick)", value: "403374" },
            { title: "怪兽宇宙 (哥斯拉/金刚)", value: "535313" },
            { title: "变形金刚 (Transformers)", value: "8650" },
            { title: "黑客帝国 (Matrix)", value: "2344" },
            { title: "玩具总动员 (Toy Story)", value: "10194" },
            { title: "饥饿游戏 (Hunger Games)", value: "131635" },
            { title: "暮光之城 (Twilight)", value: "33514" }
          ]
        },
        // 3. 自定义搜索框 (仅当选择自定义时有效，利用 belongTo 联动)
        {
          name: "customQuery",
          title: "搜索系列名",
          type: "input",
          description: "例如：教父、生化危机、异形",
          belongTo: {
            paramName: "presetId",
            value: ["custom"]
          }
        },
        // 4. 排序方式
        {
          name: "sortOrder",
          title: "观看顺序",
          type: "enumeration",
          value: "asc",
          enumOptions: [
            { title: "按上映时间 (正序 1->N)", value: "asc" },
            { title: "按上映时间 (倒序 N->1)", value: "desc" },
            { title: "按评分 (由高到低)", value: "rating" }
          ]
        }
      ]
    }
  ]
};

async function loadFranchise(params = {}) {
  const apiKey = params.apiKey;
  if (!apiKey) {
    return [{ id: "err", title: "❌ 请填写 API Key", type: "text" }];
  }

  let collectionId = params.presetId;
  const customQuery = params.customQuery;
  const sortOrder = params.sortOrder || "asc";

  // 1. 处理自定义搜索
  if (collectionId === "custom") {
      if (!customQuery) {
          return [{ id: "err_no_q", title: "❌ 请输入搜索词", subTitle: "在配置中输入系列名称", type: "text" }];
      }
      console.log(`[Collection] Searching: ${customQuery}`);
      // 搜索合集 ID
      const searchId = await searchCollectionId(customQuery, apiKey);
      if (!searchId) {
          return [{ id: "err_404", title: "🤔 未找到合集", subTitle: "TMDB 没有该系列的官方合集", type: "text" }];
      }
      collectionId = searchId;
  }

  console.log(`[Collection] Fetching ID: ${collectionId}`);

  // 2. 获取合集详情
  // 接口: /collection/{collection_id}
  const url = `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${apiKey}&language=zh-CN`;

  try {
    const res = await Widget.http.get(url);
    const data = res.data || res;

    if (!data.parts || data.parts.length === 0) {
        return [{ id: "err_empty", title: "合集数据为空", type: "text" }];
    }

    // 3. 排序 (Sort)
    // parts 数组里包含该系列的所有电影
    let movies = data.parts;

    movies.sort((a, b) => {
        if (sortOrder === "rating") {
            return b.vote_average - a.vote_average;
        } else {
            // 按日期排序
            const dateA = new Date(a.release_date || "2099-01-01");
            const dateB = new Date(b.release_date || "2099-01-01");
            return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
        }
    });

    // 4. 格式化返回
    // 获取合集总览信息，作为第一条或者日志
    const collectionName = data.name;

    return movies.map((item, index) => {
        // 只有上映过的才有年份
        const year = (item.release_date || "").substring(0, 4);
        
        // 构造序号: 正序时为 1, 2, 3...
        const rank = index + 1;

        return {
            id: String(item.id),
            tmdbId: parseInt(item.id),
            type: "tmdb",
            mediaType: "movie", // 合集里通常都是电影
            
            // 标题: 1. 哈利波特与魔法石
            title: `${rank}. ${item.title}`,
            
            // 副标题: 2001 | 8.2分
            subTitle: `${year} | ⭐️ ${item.vote_average.toFixed(1)}`,
            
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            
            rating: item.vote_average.toFixed(1),
            year: year,
            
            // 简介里显示合集名称，显得整齐
            description: `所属系列: ${collectionName}`
        };
    });

  } catch (e) {
    return [{ id: "err_net", title: "网络错误", subTitle: e.message, type: "text" }];
  }
}

// ==========================================
// 辅助工具：搜索合集 ID
// ==========================================
async function searchCollectionId(query, apiKey) {
    const url = `https://api.themoviedb.org/3/search/collection?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=zh-CN&page=1`;
    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;
        
        if (data.results && data.results.length > 0) {
            // 返回第一个匹配项的 ID
            return data.results[0].id;
        }
    } catch (e) {
        console.error(e);
    }
    return null;
}
