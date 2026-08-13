/* ============================================================
 * slam-nav-stack :: speaking core (最简口语模块)
 *
 * 16 words covering every IELTS speaking/writing answer:
 *   8 reason words (原因词) + 8 result words (结果词),
 *   fixed 8 pairs (背死), 10-second answer template (Part1/2)
 *   and the one-line Part3 template.
 *
 * Row format:
 *   reasons/results: [en, zh]
 *   pairs:           [reason, result]
 *   quick/part3:     [en_sentence, zh_sentence]
 * ============================================================ */
window.SPEAKING_CORE = {
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
  ]
};
