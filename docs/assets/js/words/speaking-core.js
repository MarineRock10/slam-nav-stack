/* ============================================================
 * slam-nav-stack :: speaking core (最简口语模块 · 6.0 秘籍)
 *
 * Part1 秘籍 (2 sentences → stop) · Part2 万能故事 (one story
 * for every cue card) · Part3 三件套 (Yes / Not really /
 * It depends) with formulaic follow-ups.
 *
 * Row formats:
 *   reasons/results: [en, zh]
 *   pairs:           [reason, result]
 *   quick/part3:     [en_sentence, zh_sentence]
 *   qa:              { q, qz, a, az }
 *   formula:         [en_step, zh_step] — [原因句]/[例子] are
 *                    placeholders the learner fills in live
 * ============================================================ */
window.SPEAKING_CORE = {
  /* ---- 16 词核心（口写通吃） ---- */
  reasons: [
    ["save time", "节省时间"],
    ["kill time", "打发时间"],
    ["save money", "省钱"],
    ["earn money", "赚钱"],
    ["convenient", "方便"],
    ["challenging", "有挑战"],
    ["healthy", "健康"],
    ["social", "社交"]
  ],
  results: [
    ["make life easier", "让生活更轻松"],
    ["feel relaxed", "感到放松"],
    ["feel happy", "感到开心"],
    ["independent", "独立"],
    ["efficient", "高效"],
    ["confident", "自信"],
    ["strong body", "身体强壮"],
    ["not lonely", "不孤单"]
  ],
  pairs: [
    ["save time", "make life easier"],
    ["kill time", "feel relaxed"],
    ["save money", "feel happy"],
    ["earn money", "independent"],
    ["convenient", "efficient"],
    ["challenging", "confident"],
    ["healthy", "strong body"],
    ["social", "not lonely"]
  ],
  quick: [
    ["I use apps to save time. So life is easier.", "我用应用节省时间，所以生活更轻松。"],
    ["I meet friends to be social. So I don't feel lonely.", "我和朋友见面保持社交，所以不孤单。"],
    ["I go to the gym to be healthy. So I have a strong body.", "我去健身房保持健康，所以身体强壮。"]
  ],
  part3: [
    ["People choose this because it helps save money. As a result, they feel happy.", "人们选择它因为能省钱，结果他们很开心。"],
    ["People choose this because it is convenient. As a result, they become efficient.", "人们选择它因为方便，结果他们变得高效。"]
  ],

  /* ---- Part1 秘籍：答 2 句 → 停 ---- */
  part1: {
    rule: "ANSWER 2 SENTENCES — THEN STOP",
    ruleZh: "每个问题答两句就停，别多说",
    openers: [
      ["Yes, I do.", "是的，我会。"],
      ["Not really.", "不完全是。"],
      ["Sometimes.", "有时候。"],
      ["I prefer coffee.", "我更喜欢咖啡（可选替代）"]
    ],
    fixedReasons: [
      ["Because I'm quite busy with work/study.", "因为我工作/学习挺忙的。"],
      ["Because it's relaxing.", "因为它让人放松。"]
    ],
    examples: [
      { q: "Do you like cooking?", qz: "你喜欢做饭吗？",
        a: "Yes, I do. Because it relaxes me after work.", az: "是的，我喜欢。因为工作后它让我放松。" },
      { q: "Do you prefer parks or cafes?", qz: "你更喜欢公园还是咖啡馆？",
        a: "I prefer cafes. Because I can sit and use Wi-Fi.", az: "我更喜欢咖啡馆。因为我可以坐下用 Wi-Fi。" },
      { q: "Do you often take photos?", qz: "你经常拍照吗？",
        a: "Sometimes. Because I want to record daily life.", az: "有时候。因为我想记录日常生活。" }
    ]
  },

  /* ---- Part2 万能故事：一个故事套所有题 ---- */
  part2: {
    event: "上周六很累 → 和朋友去市中心吃火锅 → 拍照 → 走路回家 → 周日休息",
    keywords: ["friend", "hotpot", "city centre", "photos", "walk", "relax"],
    structure: [
      { tag: "开头", en: "Last week, I had a nice time with my friend.", zh: "上周，我和朋友度过了愉快的时光。" },
      { tag: "中间", en: "We went to eat hotpot in the city centre. After that, we walked home. I took some photos.", zh: "我们去市中心吃火锅。之后走路回家。我拍了一些照片。" },
      { tag: "结尾", en: "It was simple, but I felt really relaxed.", zh: "虽然简单，但我感到非常放松。" }
    ]
  },

  /* ---- Part3 三件套 + 三套接法 ---- */
  part3kit: {
    openers: [
      ["Yes, I think so.", "是的，我认为如此。"],
      ["Not really.", "不完全是。"],
      ["It depends.", "看情况。"]
    ],
    yes: {
      when: "Should … / Is it good to … / Do people …",
      whenZh: "应该……吗 / ……好吗 / 人们……吗",
      examples: [
        "Should children learn cooking?",
        "Do people like online shopping?",
        "Is technology making life easier?"
      ],
      formula: [
        ["Yes, I think so.", "是的，我认为如此。"],
        ["Because [原因句].", "因为……（套 16 词原因）"],
        ["For example, [例子].", "例如……"],
        ["So it's common now.", "所以现在这很常见。"]
      ]
    },
    notreally: {
      when: "Is X useless? / Should we stop …? / Are people losing …?",
      whenZh: "X 没用吗 / 我们应该停止……吗 / 人们正在失去……吗",
      examples: [
        "Is handwriting useless?",
        "Should schools stop teaching art?",
        "Are people losing real conversations?"
      ],
      formula: [
        ["Not really.", "不完全是。"],
        ["Because it still has value.", "因为它仍然有价值。"],
        ["For example, [例子].", "例如……"],
        ["So it shouldn't be ignored.", "所以它不应被忽视。"]
      ]
    },
    depends: {
      when: "Why do some people …? / Is it better to A or B? / Do young/old … differently?",
      whenZh: "为什么有些人…… / A 和 B 哪个更好 / 年轻人和老人……是否不同",
      examples: [
        "Why do some prefer cities?",
        "Is it better to work from home?",
        "Do young people read more?"
      ],
      formula: [
        ["It depends.", "看情况。"],
        ["Some prefer A, others prefer B.", "有些人喜欢 A，另一些人喜欢 B。"],
        ["For example, young people …, but older people …", "例如，年轻人……，但老年人……"],
        ["So no single answer.", "所以没有唯一答案。"]
      ]
    }
  }
};
