/* ============================================================
 * slam-nav-stack :: Chinese glosses for core-vocab words (离线补齐)
 *
 * The curated core-vocab deck ships English-only {d, e} entries.
 * These 57 words are NOT present in ielts-data.js, so they had no
 * Chinese gloss and recognition options rendered blank. This file
 * fills { t: 中文释义, us/uk: 音标 } — same row format as
 * ielts-data.js — applied by Lexicon.load() when the entry's
 * fields are empty.
 * ============================================================ */
(function (global) {
  "use strict";

  const CORE_ZH = {
    "aggregate": { t: "adj. 总计的；聚合的 n. 总计；集合体", us: "ˈæɡrɪɡət", uk: "ˈæɡrɪɡət" },
    "analyze": { t: "vt. 分析；解析；分解", us: "ˈænəlaɪz", uk: "ˈænəlaɪz" },
    "authentic": { t: "adj. 真实的；可信的；可靠的", us: "ɔːˈθentɪk", uk: "ɔːˈθentɪk" },
    "brief": { t: "adj. 简短的；短暂的 n. 摘要；简报", us: "briːf", uk: "briːf" },
    "capability": { t: "n. 能力；才能；性能", us: "ˌkeɪpəˈbɪləti", uk: "ˌkeɪpəˈbɪləti" },
    "cease": { t: "vi. 停止；终止 vt. 使停止", us: "siːs", uk: "siːs" },
    "compile": { t: "vt. 汇编；编纂；收集", us: "kəmˈpaɪl", uk: "kəmˈpaɪl" },
    "consent": { t: "n. 同意；准许 vi. 同意；赞成", us: "kənˈsent", uk: "kənˈsent" },
    "constitute": { t: "vt. 构成；组成；设立", us: "ˈkɑːnstɪtuːt", uk: "ˈkɒnstɪtjuːt" },
    "conventional": { t: "adj. 传统的；常规的；符合习俗的", us: "kənˈvenʃənl", uk: "kənˈvenʃənl" },
    "converge": { t: "vi. 汇聚；聚集；趋同", us: "kənˈvɜːrdʒ", uk: "kənˈvɜːdʒ" },
    "discourse": { t: "n. 论述；话语；谈话", us: "ˈdɪskɔːrs", uk: "ˈdɪskɔːs" },
    "discriminate": { t: "v. 歧视；区别；辨别", us: "dɪˈskrɪmɪneɪt", uk: "dɪˈskrɪmɪneɪt" },
    "empirical": { t: "adj. 经验主义的；以实验为依据的", us: "ɪmˈpɪrɪkl", uk: "ɪmˈpɪrɪkl" },
    "exceed": { t: "vt. 超过；超越；超出", us: "ɪkˈsiːd", uk: "ɪkˈsiːd" },
    "framework": { t: "n. 框架；结构；体系", us: "ˈfreɪmwɜːrk", uk: "ˈfreɪmwɜːk" },
    "imply": { t: "vt. 暗示；意味；隐含", us: "ɪmˈplaɪ", uk: "ɪmˈplaɪ" },
    "incidence": { t: "n. 发生率；发生；影响范围", us: "ˈɪnsɪdəns", uk: "ˈɪnsɪdəns" },
    "infer": { t: "vt. 推断；推论；猜想", us: "ɪnˈfɜːr", uk: "ɪnˈfɜː" },
    "inhibit": { t: "vt. 抑制；阻止；妨碍", us: "ɪnˈhɪbɪt", uk: "ɪnˈhɪbɪt" },
    "justify": { t: "vt. 证明…正当；为…辩护", us: "ˈdʒʌstɪfaɪ", uk: "ˈdʒʌstɪfaɪ" },
    "labor": { t: "n. 劳动；劳工；分娩", us: "ˈleɪbər", uk: "ˈleɪbə" },
    "logic": { t: "n. 逻辑；逻辑学；推理", us: "ˈlɑːdʒɪk", uk: "ˈlɒdʒɪk" },
    "minimal": { t: "adj. 最小的；极少的", us: "ˈmɪnɪml", uk: "ˈmɪnɪml" },
    "minimize": { t: "vt. 使减到最少；最小化", us: "ˈmɪnɪmaɪz", uk: "ˈmɪnɪmaɪz" },
    "neutral": { t: "adj. 中立的；中性的；不偏不倚的", us: "ˈnuːtrəl", uk: "ˈnjuːtrəl" },
    "notion": { t: "n. 概念；观念；想法", us: "ˈnoʊʃn", uk: "ˈnəʊʃn" },
    "occupy": { t: "vt. 占据；占用；占领；使忙碌", us: "ˈɑːkjupaɪ", uk: "ˈɒkjupaɪ" },
    "ongoing": { t: "adj. 持续的；进行中的", us: "ˈɑːnɡoʊɪŋ", uk: "ˈɒnɡəʊɪŋ" },
    "overlap": { t: "v. 重叠；部分相同 n. 重叠部分", us: "ˌoʊvərˈlæp", uk: "ˌəʊvəˈlæp" },
    "paradigm": { t: "n. 范例；范式；典范", us: "ˈpærədaɪm", uk: "ˈpærədaɪm" },
    "parameter": { t: "n. 参数；界限；范围", us: "pəˈræmɪtər", uk: "pəˈræmɪtə" },
    "period": { t: "n. 时期；阶段；周期；句号", us: "ˈpɪriəd", uk: "ˈpɪəriəd" },
    "persist": { t: "vi. 坚持；持续；固执", us: "pərˈsɪst", uk: "pəˈsɪst" },
    "policy": { t: "n. 政策；方针；保险单", us: "ˈpɑːləsi", uk: "ˈpɒləsi" },
    "pose": { t: "vt. 造成；提出；摆姿势 n. 姿势", us: "poʊz", uk: "pəʊz" },
    "prevail": { t: "vi. 盛行；获胜；占优势", us: "prɪˈveɪl", uk: "prɪˈveɪl" },
    "prime": { t: "adj. 首要的；最好的 n. 全盛期", us: "praɪm", uk: "praɪm" },
    "proceed": { t: "vi. 继续进行；前进；着手", us: "proʊˈsiːd", uk: "prəˈsiːd" },
    "protocol": { t: "n. 协议；规程；礼节", us: "ˈproʊtəkɔːl", uk: "ˈprəʊtəkɒl" },
    "publish": { t: "vt. 出版；发表；公布", us: "ˈpʌblɪʃ", uk: "ˈpʌblɪʃ" },
    "pursue": { t: "vt. 追求；从事；追赶", us: "pərˈsuː", uk: "pəˈsjuː" },
    "qualitative": { t: "adj. 定性的；性质上的", us: "ˈkwɑːlɪteɪtɪv", uk: "ˈkwɒlɪtətɪv" },
    "quantify": { t: "vt. 量化；确定…的数量", us: "ˈkwɑːntɪfaɪ", uk: "ˈkwɒntɪfaɪ" },
    "reject": { t: "vt. 拒绝；排斥；驳回 n. 废品", us: "rɪˈdʒekt", uk: "rɪˈdʒekt" },
    "remove": { t: "vt. 移除；去掉；开除", us: "rɪˈmuːv", uk: "rɪˈmuːv" },
    "reside": { t: "vi. 居住；定居；存在于", us: "rɪˈzaɪd", uk: "rɪˈzaɪd" },
    "respond": { t: "vi. 回应；回答；作出反应", us: "rɪˈspɑːnd", uk: "rɪˈspɒnd" },
    "restore": { t: "vt. 恢复；修复；归还", us: "rɪˈstɔːr", uk: "rɪˈstɔː" },
    "select": { t: "vt. 选择；挑选 adj. 精选的", us: "sɪˈlekt", uk: "sɪˈlekt" },
    "series": { t: "n. 系列；连续；丛书", us: "ˈsɪriːz", uk: "ˈsɪəriːz" },
    "statistic": { t: "n. 统计数字；统计数据", us: "stəˈtɪstɪk", uk: "stəˈtɪstɪk" },
    "supplement": { t: "n. 补充；增刊 vt. 补充；增补", us: "ˈsʌplɪmənt", uk: "ˈsʌplɪmənt" },
    "terminate": { t: "v. 终止；结束；解雇", us: "ˈtɜːrmɪneɪt", uk: "ˈtɜːmɪneɪt" },
    "thereby": { t: "adv. 因此；由此；从而", us: "ˌðerˈbaɪ", uk: "ˌðeəˈbaɪ" },
    "undertake": { t: "vt. 承担；从事；承诺", us: "ˌʌndərˈteɪk", uk: "ˌʌndəˈteɪk" },
    "whereas": { t: "conj. 然而；鉴于；反之", us: "ˌwerˈæz", uk: "ˌweərˈæz" }
  };

  global.CORE_ZH = CORE_ZH;
})(window);
