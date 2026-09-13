/** UI copy. Per-opponent lines live under `fly` / `robot`; {n} and {d} are
 *  filled with real numbers from the search, never invented. */
const EN_FLY = {
  think: ["Hmm…", "Let me look…", "Buzzing…", "Counting…"],
  idle: ["Take your time… I'll nap. 💤", "Psst… corners taste best.", "Still thinking? Me too.",
         "I can see 721 of you right now.", "My brain weighs less than a grain of rice.",
         "Is that a banana over there?", "I only have 0.0001% of your neurons. Be gentle.",
         "Bzzz… still here.", "I'd flip that one. Just saying."],
  shrug: "No idea. Picking at random.",
  note: "Every move comes from a real fly connectome — 138,639 neurons.",
} as const;

const EN_ROBOT = {
  think: ["Looking {d} moves ahead.", "Trying {n} lines.", "Comparing {n} options.", "{n} positions checked."],
  idle: ["I'm not a brain. I just try every move.",
         "A fly has 138,639 neurons. I have 88 lines of code.",
         "I don't get nervous. I only count.",
         "I already know what I'm playing.",
         "Corners are worth 30. Everything else is worth less.",
         "I cut away most of the branches. That's why I'm quick.",
         "Take your time. I can wait exactly as long as you need."],
  shrug: "Every move scores the same here.",
  note: "This opponent is an 88-line search — the same one that trained the fly.",
} as const;

const ZH_FLY = {
  think: ["嗯……", "让我看看……", "嗡嗡……", "数一数……"],
  idle: ["慢慢来，我先眯一会儿。💤", "偷偷告诉你：角落最好吃。", "还在想呀？我也是。",
         "我现在能看见 721 个你。", "我的脑子比一粒米还轻。",
         "那边是不是有根香蕉？", "我的神经元只有你的百万分之一，手下留情。",
         "嗡……我还在。", "换我就翻那颗。随便说说。"],
  shrug: "没想法，随便下一个。",
  note: "每一步都来自一只真果蝇的连接组 —— 138,639 个神经元。",
} as const;

const ZH_ROBOT = {
  think: ["往前看 {d} 步。", "我试了 {n} 种走法。", "在比较 {n} 种可能。", "算过 {n} 个局面。"],
  idle: ["我不是大脑，我只是把每种走法都试了一遍。",
         "果蝇有 13.8 万个神经元，我只有 88 行代码。",
         "我不会紧张，我只会算。",
         "我已经知道要下哪了。",
         "角落值 30 分，其他都不值钱。",
         "我砍掉了大部分分支，所以我快。",
         "慢慢来，我可以一直等。"],
  shrug: "每一步在我看来都一样。",
  note: "对手是一个 88 行的搜索算法 —— 训练果蝇用的就是它。",
} as const;

export const T = {
  en: {
    undo: "Undo", nw: "New", lang: "中文", size6: "6×6", size8: "8×8", cancel: "Cancel",
    yourTurn: "Your turn — tap a glowing dot.", yourTurnNoHint: "Your turn.",
    noMove: "No moves — you pass!", oppPass: "No moves for them. Your turn again!",
    win: "You win! 🎉", lose: "You lost!", draw: "A tie!",
    chTitle: "New game", chSub: "Black always starts.", chWho: "Who are you playing?",
    chDepth: "Thinking depth", oppFly: "Fly", oppRobot: "Robot",
    pdT: "I'm Black", pdS: "you go first", plT: "I'm White", plS: "they go first",
    loading: "Waking the fly…", loadSub: "loading connectome", loadFail: "Could not wake the fly",
    brandSub: "a real fly brain plays Othello",
    panelFly: "Live neural activity", panelEngine: "Search tree",
    legendFly: "138,639 neurons · 2,700,513 synapses",
    legendEngine: "nodes searched · branches pruned",
    fly: EN_FLY, robot: EN_ROBOT,
  },
  zh: {
    undo: "悔棋", nw: "新局", lang: "EN", size6: "6×6", size8: "8×8", cancel: "取消",
    yourTurn: "轮到你了 —— 点发光的圆点。", yourTurnNoHint: "轮到你了。",
    noMove: "你没地方下，轮空啦！", oppPass: "对手没地方下，又轮到你了！",
    win: "你赢啦！🎉", lose: "你输了！", draw: "平局！",
    chTitle: "新的一局", chSub: "黑子永远先走。", chWho: "跟谁下？",
    chDepth: "思考深度", oppFly: "果蝇", oppRobot: "机器人",
    pdT: "我执黑", pdS: "你先走", plT: "我执白", plS: "对手先走",
    loading: "正在唤醒果蝇……", loadSub: "加载连接组", loadFail: "果蝇没醒过来",
    brandSub: "一只真果蝇的大脑在下黑白棋",
    panelFly: "神经元实时活动", panelEngine: "搜索决策树",
    legendFly: "138,639 个神经元 · 2,700,513 条突触",
    legendEngine: "已搜索节点 · 被剪枝分支",
    fly: ZH_FLY, robot: ZH_ROBOT,
  },
} as const;

export type Lang = keyof typeof T;
