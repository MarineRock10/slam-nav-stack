/* ============================================================
 * slam-nav-stack :: cognitive theme arc (认知弧线)
 *
 * The 22-chapter learning order follows the "cognitive arc"
 * design (perception of time → self → society → world → cosmos),
 * the same ordering used by the 21-day IELTS vocabulary course:
 * words are hung on the order a human being comes to know the
 * world, instead of alphabet or source-book order.
 *
 * Each theme carries keyword rules (Chinese gloss + English
 * stem patterns) used to auto-tag the lexicon. Scoring:
 *   zhKey hit (Chinese translation)  +2
 *   enKey hit (word stem / EN gloss) +1
 * Highest score wins; ties resolve to the earlier theme in the
 * arc (time-first). A word with no hit lands in the GENERAL pool
 * and is scheduled as filler.
 * ============================================================ */
(function (global) {
  "use strict";

  const ARC = [
    { id: "time", name: "时间日期",
      zhKey: ["时间", "年代", "日期", "时期", "时代", "世纪", "纪元", "季节", "年份", "周年", "期间", "时刻", "日历", "黎明", "黄昏", "午夜", "中午", "今日", "昨天", "明天", "瞬间", "暂时", "当代", "现代", "古老", "定期", "日常", "每日", "每周", "月度", "年度", "日程", "秋天", "春天", "生日"],
      enKey: ["chron", "tempor", "ann", "annu", "era", "epoch", "dawn", "dusk", "noon", "midnight", "calendar", "decade", "century", "millen", "moment", "instant", "temporary", "contemporary", "ancient", "modern", "daily", "weekly", "monthly", "annual", "season", "schedule", "period", "centur"] },

    { id: "diet", name: "饮食健康",
      zhKey: ["食物", "饮食", "营养", "餐", "吃", "喝", "味道", "烹饪", "早餐", "晚餐", "食谱", "蔬菜", "水果", "肉", "鱼", "饮料", "酒", "甜", "酸", "苦", "辣", "饥饿", "胃口", "脂肪", "蛋白", "维生", "卡路里", "餐", "食", "味"],
      enKey: ["food", "eat", "drink", "nutri", "diet", "meal", "cook", "cuisine", "taste", "flavor", "vegetable", "fruit", "meat", "fish", "beverage", "alcohol", "recipe", "calorie", "protein", "vitamin", "fat", "sugar", "salt", "hungry", "appetite", "delicious", "snack", "barbecue", "lemon", "chef"] },

    { id: "health", name: "身心健康",
      zhKey: ["健康", "疾病", "病", "医疗", "药", "医院", "医生", "护士", "症", "疼痛", "伤", "治疗", "心理", "情绪", "情感", "感受", "感觉", "快乐", "悲伤", "愤怒", "恐惧", "焦虑", "压力", "疲劳", "睡眠", "身体", "大脑", "肌肉", "心脏", "血液", "皮肤", "免疫", "细菌", "病毒", "传染", "康复", "症状", "诊所", "精神", "抑郁", "情绪", "安全"],
      enKey: ["health", "ill", "disease", "medic", "doct", "nurse", "hospital", "pain", "injur", "treat", "therapy", "psych", "emotion", "feel", "happ", "sad", "anger", "fear", "anxiet", "stress", "tired", "fatigue", "sleep", "body", "brain", "muscle", "heart", "blood", "skin", "immun", "bacter", "virus", "infect", "recov", "symptom", "clinic", "mental", "depress", "mood", "cancer", "fever", "dizzy", "breath", "lung", "nerve"] },

    { id: "role", name: "社会角色",
      zhKey: ["角色", "身份", "职业", "职位", "父母", "母亲", "父亲", "家庭", "婚姻", "夫妻", "孩子", "儿童", "青年", "老年", "妇女", "男人", "女性", "男性", "邻居", "朋友", "同事", "老板", "员工", "领导", "公民", "成员", "性格", "个性", "责任", "义务", "关系", "社会", "行为", "举止", "礼貌", "会议", "聚会"],
      enKey: ["role", "identit", "profession", "occup", "career", "parent", "mother", "father", "famil", "marri", "spouse", "child", "youth", "elder", "woman", "man", "female", "male", "neighbor", "friend", "colleague", "boss", "employee", "leader", "citizen", "member", "personal", "charact", "responsib", "duty", "relation", "social", "behav", "manner", "personality", "generation", "adult", "teenager", "baby", "infant", "guest", "host", "companion"] },

    { id: "action", name: "行为动作",
      zhKey: ["动作", "行为", "移动", "走", "跑", "跳", "抓", "拿", "放", "推", "拉", "扔", "举", "爬", "坐", "站", "躺", "看", "听", "想", "记得", "忘记", "帮助", "给予", "得到", "找到", "失去", "改变", "增加", "减少", "开始", "结束", "继续", "停止", "尝试", "成功", "失败", "完成", "创造", "破坏", "建造", "修理", "打开", "关闭", "产生", "提供", "要求", "包含", "支持", "建议", "决定", "描述", "解释", "比较", "表达", "防止", "保护", "允许", "避免", "发生", "涉及", "维持", "管理", "提到", "观察", "获得", "出现", "执行", "计划", "准备", "呈现", "保持", "返回", "似乎", "服务", "分享", "显示", "解决", "花费", "遭受", "生存", "倾向", "使用", "访问", "等待", "浪费", "担心", "努力", "练习", "聚集", "发展", "提高", "减少", "增加"],
      enKey: ["run", "walk", "move", "jump", "reach", "hold", "push", "pull", "throw", "lift", "climb", "sit", "stand", "lie", "look", "watch", "listen", "speak", "say", "write", "read", "think", "remember", "forget", "help", "give", "take", "get", "find", "lose", "change", "increase", "decrease", "begin", "start", "end", "finish", "continue", "stop", "try", "succeed", "fail", "complete", "create", "destroy", "build", "repair", "open", "close", "achieve", "develop", "improve", "reduce", "produce", "provide", "require", "include", "contain", "support", "suggest", "decide", "describe", "explain", "compare", "express", "prevent", "protect", "allow", "avoid", "attend", "belong", "behave", "cause", "concern", "consist", "contribute", "deal", "depend", "differ", "exist", "expect", "face", "follow", "happen", "involve", "maintain", "manage", "mention", "observe", "obtain", "occur", "offer", "perform", "plan", "prefer", "prepare", "present", "remain", "result", "return", "seem", "serve", "share", "show", "solve", "spend", "suffer", "survive", "tend", "use", "visit", "wait", "waste", "wonder", "worry", "attempt", "effort", "practice", "act", "action"] },

    { id: "language", name: "语言演化",
      zhKey: ["语言", "言语", "说话", "单词", "词汇", "语法", "发音", "字母", "句子", "交流", "沟通", "翻译", "方言", "口音", "拼写", "口语", "书面", "语言", "词", "话"],
      enKey: ["language", "speech", "word", "vocab", "grammar", "pronunc", "letter", "sentence", "communic", "translat", "dialect", "accent", "spell", "linguist", "phrase", "narrat", "oral", "verbal", "written", "utter", "convers", "expression", "idiom", "syllable", "vowel", "consonant", "tongue"] },

    { id: "education", name: "学校教育",
      zhKey: ["学校", "教育", "学习", "学生", "老师", "教授", "课程", "科目", "知识", "考试", "测验", "成绩", "分数", "学位", "大学", "学院", "教室", "图书馆", "作业", "训练", "研究", "学术", "论文", "毕业", "入学", "教", "学", "练习", "技巧", "能力", "理解", "课", "知识"],
      enKey: ["school", "educat", "learn", "student", "teacher", "professor", "cours", "subject", "knowledge", "exam", "test", "grade", "degree", "university", "college", "class", "library", "homework", "train", "research", "academ", "thesis", "graduate", "admit", "instruct", "practic", "skill", "abilit", "understand", "tuition", "scholar", "curriculum", "lecture", "seminar", "discipline", "assignment", "syllabus", "campus", "diploma", "intellect"] },

    { id: "tech", name: "科技发明",
      zhKey: ["科技", "技术", "发明", "机器", "设备", "装置", "工具", "电子", "数字", "计算", "数据", "网络", "互联网", "软件", "硬件", "程序", "系统", "信息", "通信", "电话", "手机", "电脑", "机器人", "自动化", "能源", "电力", "电池", "引擎", "机械", "实验室", "实验", "科学", "物理", "化学", "生物", "数学", "工程", "创新", "专利", "传感器", "激光", "核"],
      enKey: ["techn", "invent", "machine", "device", "equip", "tool", "electron", "digital", "comput", "data", "network", "internet", "softwar", "program", "system", "inform", "communic", "phone", "computer", "robot", "automat", "energy", "electric", "battery", "engine", "mechanic", "lab", "experiment", "science", "physic", "chem", "biolog", "math", "engineer", "innovat", "patent", "sensor", "laser", "nuclear", "quantum", "microscop", "formula", "precision"] },

    { id: "culture", name: "文化历史",
      zhKey: ["文化", "历史", "传统", "风俗", "习俗", "节日", "艺术", "音乐", "绘画", "雕塑", "文学", "诗歌", "小说", "戏剧", "电影", "宗教", "信仰", "神话", "传说", "遗产", "文明", "纪念", "博物馆", "古迹", "遗址", "皇室", "王国", "王朝", "艺术家", "歌曲", "舞蹈", "戏剧", "肖像", "音乐"],
      enKey: ["culture", "histor", "tradit", "custom", "festiv", "art", "music", "paint", "sculpt", "literatur", "poem", "novel", "drama", "film", "religion", "faith", "myth", "legend", "heritag", "civiliz", "ancient", "origin", "commemor", "museum", "ruin", "kingdom", "dynast", "artist", "band", "song", "dance", "theat", "portrait", "gallery", "orchestra", "melody", "poet", "singer", "celebrat"] },

    { id: "leisure", name: "娱乐运动",
      zhKey: ["娱乐", "运动", "游戏", "比赛", "体育", "足球", "篮球", "网球", "游泳", "跑步", "健身", "锻炼", "休闲", "假期", "爱好", "兴趣", "电视", "视频", "玩具", "牌", "棋", "观众", "球迷", "冠军", "奖牌", "获胜", "竞赛", "运动员", "教练", "团队", "得分", "乐趣", "放松", "聚会", "野餐", "露营"],
      enKey: ["entertain", "sport", "game", "match", "athlet", "football", "basket", "tennis", "swim", "run", "fit", "exercis", "leisure", "holiday", "hobby", "interest", "television", "video", "toy", "chess", "audience", "fan", "champion", "medal", "win", "compet", "coach", "team", "score", "play", "fun", "enjoy", "relax", "party", "camp", "picnic", "race", "golf", "yoga", "tournament", "spectator", "recreation"] },

    { id: "fashion", name: "时尚潮流",
      zhKey: ["时尚", "潮流", "服装", "衣服", "鞋子", "帽子", "珠宝", "化妆", "发型", "颜色", "设计", "风格", "品牌", "奢侈", "优雅", "漂亮", "美丽", "穿着", "佩戴", "织物", "布料", "裁缝"],
      enKey: ["fashion", "trend", "cloth", "wear", "dress", "shoe", "hat", "jewel", "makeup", "hair", "color", "design", "style", "brand", "luxury", "elegant", "beautiful", "pretty", "attract", "garment", "fabric", "textile", "tailor", "fancy", "decorat", "ornament", "accessory", "glamor"] },

    { id: "government", name: "国家政府",
      zhKey: ["国家", "政府", "政治", "政策", "总统", "首相", "官员", "选举", "投票", "政党", "议会", "宪法", "权力", "民主", "制度", "治理", "外交", "大使", "同盟", "联合国", "国界", "领土", "主权", "福利", "公共", "市政", "权威", "州"],
      enKey: ["government", "nation", "polit", "policy", "president", "minister", "official", "elect", "vote", "party", "parliament", "constitut", "power", "democrat", "regime", "govern", "diplomat", "ambassador", "alliance", "territor", "sovereign", "public", "municipal", "admin", "authority", "state", "republic", "monarch", "bureau", "congress", "senate"] },

    { id: "law", name: "法律法规",
      zhKey: ["法律", "法规", "法院", "法官", "律师", "审判", "犯罪", "罪犯", "违法", "合法", "罚款", "监狱", "警察", "证据", "证人", "起诉", "辩护", "合同", "权利", "禁止", "允许", "规定", "规则", "条例", "判刑", "无罪", "有罪", "逮捕", "盗窃", "抢劫", "谋杀", "欺诈", "纠纷", "正义", "惩罚", "处罚"],
      enKey: ["law", "legal", "court", "judge", "lawyer", "trial", "crime", "criminal", "offend", "illegal", "legal", "fine", "prison", "police", "evidenc", "witness", "prosecut", "defend", "contract", "right", "prohibit", "forbid", "regul", "rule", "statute", "sentence", "guilty", "innocent", "arrest", "theft", "rob", "murder", "fraud", "dispute", "justice", "penalty", "punish", "legislat", "violat", "custody", "verdict"] },

    { id: "economy", name: "社会经济",
      zhKey: ["经济", "商业", "贸易", "市场", "公司", "企业", "银行", "金融", "货币", "金钱", "价格", "成本", "利润", "投资", "股票", "税收", "工资", "收入", "消费", "购买", "销售", "广告", "产品", "生产", "工业", "农业", "制造", "雇佣", "失业", "通货膨胀", "债务", "贷款", "富裕", "贫穷", "竞争", "垄断", "出口", "进口", "预算", "财富", "交易", "商人", "客户", "服务", "零售", "批发", "货币", "现金", "投标", "索赔"],
      enKey: ["econom", "business", "trade", "market", "company", "enterpris", "bank", "financ", "money", "price", "cost", "profit", "invest", "stock", "tax", "salary", "wage", "income", "consum", "purchas", "buy", "sell", "advert", "product", "produc", "industry", "agricult", "manufactur", "employ", "unemploy", "inflat", "debt", "loan", "rich", "wealth", "poor", "competit", "monopol", "export", "import", "budget", "transaction", "merchant", "customer", "service", "commerce", "retail", "wholesale", "currency", "cash", "bargain", "bid", "claim", "fund", "insur", "mortgage"] },

    { id: "warfare", name: "沙场争锋",
      zhKey: ["战争", "战斗", "军队", "士兵", "武器", "枪", "炮", "炸弹", "导弹", "冲突", "入侵", "侵略", "防御", "攻击", "征服", "胜利", "战场", "战略", "战术", "堡垒", "将军", "敌人", "投降", "和平", "伤亡", "战斗", "军事", "部队", "剑", "盾"],
      enKey: ["war", "battle", "army", "soldier", "weapon", "gun", "bomb", "missile", "conflict", "invad", "aggress", "defend", "attack", "conquer", "victory", "defeat", "strateg", "tactic", "fort", "general", "enemy", "alli", "surrender", "peace", "casualty", "combat", "milit", "troop", "rifle", "sword", "shield", "siege", "rebel", "revolt", "ceasefire", "truce", "ambush"] },

    { id: "transport", name: "交通旅行",
      zhKey: ["交通", "运输", "旅行", "旅游", "游客", "汽车", "火车", "飞机", "船", "自行车", "道路", "公路", "铁路", "机场", "车站", "港口", "行李", "地图", "方向", "路线", "旅程", "航班", "驾驶", "乘客", "交通堵塞", "汽油", "燃料", "导航", "目的地", "护照", "签证", "酒店", "住宿", "通勤", "航行", "出发", "到达", "车费", "航程", "车辆", "预订", "预约"],
      enKey: ["transport", "travel", "tour", "tourist", "car", "train", "plane", "ship", "boat", "bike", "road", "highway", "rail", "airport", "station", "port", "luggage", "map", "direct", "route", "journey", "flight", "drive", "passenger", "traffic", "fuel", "navig", "destin", "passport", "visa", "hotel", "accommodation", "vehicle", "commute", "cruise", "depart", "arrive", "trip", "voyage", "fare", "motor", "pedestrian", "cycle", "hitch"] },

    { id: "building", name: "建筑场所",
      zhKey: ["建筑", "房屋", "房子", "公寓", "办公室", "商店", "商场", "教堂", "寺庙", "城堡", "塔", "桥", "墙", "屋顶", "窗", "楼梯", "房间", "客厅", "卧室", "浴室", "花园", "广场", "街道", "城市", "乡村", "村庄", "社区", "地区", "区域", "场所", "场地", "工厂", "仓库", "剧院", "公园", "结构", "地基", "楼层", "建筑师", "城市", "农村", "居民", "住所", "庄园"],
      enKey: ["building", "house", "apartment", "office", "shop", "store", "mall", "church", "temple", "castle", "tower", "bridge", "wall", "roof", "door", "window", "stair", "room", "garden", "square", "street", "city", "town", "village", "commun", "area", "region", "place", "site", "factory", "warehous", "theatr", "park", "structur", "foundat", "floor", "architect", "urban", "rural", "resident", "dwell", "shelter", "estate", "interior", "corridor", "ceiling", "balcony"] },

    { id: "material", name: "物质材料",
      zhKey: ["材料", "物质", "金属", "铁", "钢", "铜", "铝", "金", "银", "塑料", "玻璃", "木材", "石头", "混凝土", "纤维", "棉花", "丝绸", "油", "气体", "液体", "固体", "元素", "原子", "分子", "重量", "密度", "硬度", "腐蚀", "溶解", "混合物", "纯度", "矿", "资源", "回收", "废料", "污染", "橡胶", "皮革", "羊毛", "黏土", "水泥", "合金", "垃圾"],
      enKey: ["material", "substance", "metal", "iron", "steel", "copper", "aluminum", "gold", "silver", "plastic", "glass", "wood", "stone", "concrete", "fiber", "cotton", "silk", "oil", "gas", "liquid", "solid", "element", "atom", "molecule", "weight", "densit", "hard", "corros", "dissolv", "mixture", "pure", "mineral", "resource", "recycl", "waste", "pollut", "rubber", "leather", "wool", "clay", "cement", "alloy", "synthetic", "chemical"] },

    { id: "plant", name: "植物研究",
      zhKey: ["植物", "树", "花", "草", "种子", "根", "叶", "果实", "森林", "种植", "生长", "开花", "树木", "作物", "收成", "生态", "光合", "藻类", "真菌", "灌木", "竹", "松树", "花粉", "园艺"],
      enKey: ["plant", "tree", "flower", "grass", "seed", "root", "leaf", "fruit", "forest", "grow", "bloom", "crop", "harvest", "ecolog", "photosynth", "flora", "botany", "branch", "trunk", "stem", "petal", "pollen", "shrub", "bamboo", "oak", "pine", "weed", "fungus", "moss", "agricultural", "grain", "wheat", "rice"] },

    { id: "animal", name: "动物保护",
      zhKey: ["动物", "鸟", "昆虫", "哺乳", "爬行", "两栖", "翅膀", "羽毛", "爪", "尾巴", "皮毛", "栖息", "灭绝", "濒危", "野生动物", "家畜", "宠物", "猫", "狗", "马", "牛", "羊", "猪", "狮子", "老虎", "大象", "鲸", "鲨鱼", "蛇", "蜘蛛", "蜜蜂", "蝴蝶", "迁徙", "繁殖", "物种", "猎物", "捕食者", "动物园", "生物", "野兽", "脊椎", "爬行动物"],
      enKey: ["animal", "bird", "insect", "mammal", "reptil", "amphib", "wing", "feather", "claw", "tail", "fur", "habit", "extinct", "endanger", "wildlife", "livestock", "pet", "cat", "dog", "horse", "cow", "sheep", "pig", "lion", "tiger", "elephant", "whale", "shark", "snake", "spider", "bee", "butterfly", "migrat", "breed", "species", "prey", "predator", "zoo", "creature", "beast", "eagle", "owl", "monkey", "cattle"] },

    { id: "nature", name: "自然地理",
      zhKey: ["自然", "地理", "地球", "山脉", "山", "河", "湖", "海洋", "沙漠", "气候", "天气", "温度", "降雨", "风", "雪", "冰", "火", "地震", "火山", "洪水", "干旱", "土壤", "地形", "平原", "高原", "峡谷", "瀑布", "洞穴", "岛屿", "大陆", "大气", "环境", "全球", "温室", "臭氧", "丘陵", "山谷", "海岸", "潮汐", "波浪", "岩石", "冰川", "赤道", "热带", "潮湿", "风暴"],
      enKey: ["nature", "geograph", "earth", "mountain", "river", "lake", "sea", "ocean", "desert", "climat", "weather", "temperatur", "rain", "wind", "snow", "ice", "fire", "earthquake", "volcano", "flood", "drought", "soil", "terrain", "plain", "plateau", "canyon", "waterfall", "cave", "island", "continent", "atmospher", "environment", "global", "greenhouse", "ozone", "hill", "valley", "coast", "shore", "tide", "wave", "current", "rock", "glacier", "pole", "equator", "tropical", "humid", "storm", "precipit", "erosion", "landscape"] },

    { id: "space", name: "太空探索",
      zhKey: ["太空", "宇宙", "星球", "行星", "恒星", "太阳", "月亮", "火星", "卫星", "轨道", "火箭", "宇航员", "航天", "天文", "银河", "星系", "引力", "重力", "天文台", "望远镜", "宇宙飞船", "探索", "彗星", "小行星", "太阳系"],
      enKey: ["space", "universe", "planet", "star", "sun", "moon", "mars", "satellite", "orbit", "rocket", "astronaut", "astronom", "galaxy", "gravit", "telescope", "spacecraft", "cosm", "celestial", "comet", "asteroid", "solar", "lunar", "stellar", "interstellar"] }
  ];

  /* ---- tagging ----
   * input:  word (lowercase), trans (Chinese gloss), enDef (EN definition)
   * output: theme id or null (GENERAL pool)
   * scoring: word itself contains the theme's English stem  +3
   *          Chinese gloss contains a zhKey keyword        +2
   *          English definition contains an enKey stem     +1
   * ties resolve to the earlier theme in the arc (time-first).
   * The gloss is cleaned first: only the primary sense survives
   * (【搭配】【同根】annotation noise is dropped). */
  function matchTheme(word, trans, enDef) {
    let best = null, bestScore = 0;
    const gloss = String(trans || "").replace(/【[^】]*】/g, " ").split(/[；;]/)[0];
    const hay = gloss + " " + (enDef || "");
    const hayL = hay.toLowerCase();
    let lower = (word || "").toLowerCase();
    if (lower.endsWith("ies") && lower.length > 4) lower = lower.slice(0, -3) + "y";
    else if (lower.endsWith("es") && lower.length > 3) lower = lower.slice(0, -2);
    else if (lower.endsWith("s") && lower.length > 3 && !lower.endsWith("ss") && !lower.endsWith("us")) lower = lower.slice(0, -1);
    for (const t of ARC) {
      let score = 0;
      const excl = (global.ROOT_EXCLUDE || {})[t.id] || [];
      if (excl.indexOf(lower) < 0) {
        for (const k of t.enKey) {
          if (lower.includes(k)) { score = 3; break; }
        }
      }
      if (score < 3) {
        for (const k of t.zhKey) {
          if (hay.includes(k)) { score = 2; break; }
        }
      }
      if (score < 2) {
        for (const k of t.enKey) {
          if (hayL.includes(k)) { score = 1; break; }
        }
      }
      if (score > bestScore) { bestScore = score; best = t.id; }
    }
    return bestScore > 0 ? best : null;
  }

  global.THEME_ARC = ARC;
  global.THEME_MATCH = matchTheme;
})(window);
