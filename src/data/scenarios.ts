import { CallScenario, TheaterStory } from '../types';

export const CALL_SCENARIOS: CallScenario[] = [
  {
    id: 'police',
    title: '冒充公检法洗钱案',
    badge: '高频致命',
    callerName: '北京市公安局专案组·李警官',
    callerNumber: '010-8522xxxx (疑似网络改号)',
    description: '谎称受害人身份证办理的银行卡卷入特大跨境洗钱犯罪，要求保密、断绝与外界联系并转入安全账户。',
    openingLine: '喂！你是张某本人吗？我是北京市公安局经侦支队的李警官，警号038921！你名下的招商银行卡涉嫌一起380万元跨境特大洗钱案，专案组现在依法对你进行电话传唤核查！',
    stressFactor: '制造刑事威慑与逮捕恐惧',
    dangerKeywords: ['安全账户', '资金清查', '逮捕令', '绝密调查', '单独开房'],
  },
  {
    id: 'insurance',
    title: '微信/支付宝百万保障到期',
    badge: '近期高发',
    callerName: '微信支付保障中心客服',
    callerNumber: '95017-特服转接 (虚假呼叫)',
    description: '声称您开通了“百万医疗保障”免费体验期已过，若不立即取消将每月自动扣费800-2000元，诱导屏幕共享。',
    openingLine: '您好！这里是微信支付客服中心。系统检测到您的“百万保障”服务免费试用期今天24点截止，后续将按每月800元自动扣费。请问您需要帮您办理关闭还是续费？',
    stressFactor: '利用资金扣费担忧与操作紧迫感',
    dangerKeywords: ['屏幕共享', '会议软件', '解绑银行卡', '额度清退', '远程协助'],
  },
  {
    id: 'flight',
    title: '航班退改签赔偿理赔',
    badge: '精准信息',
    callerName: '东方航空票务应急理赔中心',
    callerNumber: '400-880-9553 (仿冒专线)',
    description: '准确报出受害人近期的真实航班信息，称因飞机机械故障取消，需提供卡号或转账激活理赔通道并赔付300元。',
    openingLine: '您好，请问是订购了明天MU5186次航班的旅客吗？非常抱歉通知您，因飞机突发机械故障该航班已取消，系统现为您改签并赔付300元延误险，请提供您的收款验证码。',
    stressFactor: '精准个人行程泄露导致防备心降低',
    dangerKeywords: ['退费链接', '验证码', '转账激活', '安全认证码', '理赔金'],
  },
  {
    id: 'boss',
    title: '假冒公司领导/熟人紧急借款',
    badge: '职场压迫',
    callerName: '单位主管·王总 (语音合成)',
    callerNumber: '138-0000-8888 (微聊/伪装短号)',
    description: '通过仿冒领导声音或紧急商务借口，称在接待领导不便露面，要求财务或员工先行垫资过桥款。',
    openingLine: '小张啊，我是王总。我正在市委接待领导开会，临时需要给合作方过桥垫付一笔20万元商务保证金，我不方便私人转，你先从部门或个人卡里转一下，下午回公司给你报销！',
    stressFactor: '职场上下级服从心理与时间紧迫催促',
    dangerKeywords: ['不要声张', '开会不便', '马上过桥', '下午报销', '代转资金'],
  },
  {
    id: 'finance',
    title: '内部高收益量化投资',
    badge: '暴利诱惑',
    callerName: '香港恒丰证券·特聘导师',
    callerNumber: '00852-6692xxxx',
    description: '声称掌握海外加密货币或期货套利内幕漏洞，带受害人“稳赚不赔”，先小额提现建立信任后大额吞没。',
    openingLine: '陈先生您好，我是之前在财经峰会和您交流过的张首席。我们团队刚刚捕获到一个跨境量化节点的套利漏洞，胜率100%，日化收益在15%以上，目前仅限内部3个名额。',
    stressFactor: '高收益诱惑与错失恐惧（FOMO）',
    dangerKeywords: ['稳赚不赔', '内部漏洞', '日化超高', '充值返还', '导师带单'],
  }
];

export const THEATER_STORIES: TheaterStory[] = [
  {
    id: 'flight_story',
    title: '迷雾航班：300元理赔金的陷阱',
    type: '机票退改签类骗局',
    tag: '新型AI高发',
    description: '临行前收到了真实的航班延误短信，紧接着一通自称航空公司的专线电话打了进来...',
    initialFunds: 50000,
    nodes: {
      start: {
        id: 'start',
        speaker: '客服工号089',
        role: '自称东航理赔专员',
        sceneDescription: '你正在候机厅准备出差，突然手机响了，对方一口报出了你的姓名、身份证后四位及明日飞往上海的航班号。',
        dialogue: '您好！我们检测到您购买的MU5186航班因起落架机械故障被迫取消。根据民航总局规定，我们将为您免费改签至2小时后的新航班，并向您赔付300元延误补偿金。请问您是否同意办理？',
        choices: [
          { text: '同意办理，请问赔偿金如何发放给我？', nextNodeId: 'agree_claim', riskChange: 20 },
          { text: '我自己去航空公司官方App确认一下。', nextNodeId: 'check_official', riskChange: -30, clue: '主动交叉核实' },
          { text: '不需要理赔，我直接办理退票。', nextNodeId: 'cancel_flight', riskChange: -10 }
        ]
      },
      check_official: {
        id: 'check_official',
        speaker: '客服工号089',
        role: '语气变得急促',
        sceneDescription: '对方听到你要去官方App，语气立刻变得焦急并严厉催促。',
        dialogue: '先生/女士！目前是雷暴突发应急阶段，官方服务器正在维护同步，App显示有1小时延迟！改签配额只剩最后2个席位了，如果超时未确认，不仅无法改签，300元赔偿通道也将永久关闭！',
        choices: [
          { text: '那好吧，请告诉我怎么操作接收赔偿。', nextNodeId: 'agree_claim', riskChange: 40 },
          { text: '哪怕延迟我也只信官方App和机场柜台，挂了。', nextNodeId: 'official_success', riskChange: -50 }
        ]
      },
      agree_claim: {
        id: 'agree_claim',
        speaker: '客服工号089',
        role: '引导操作',
        sceneDescription: '对方发来了一个短信链接，或者要求你下载“云视讯/腾讯会议”开启屏幕共享。',
        dialogue: '好的。由于民航对公企业账户限制，赔付金必须通过中国银联官方清算通道划扣。请您下载“瞩目会议”输入会议号 889210，开启屏幕共享，由理赔工程师指导您生成专属清算码。',
        choices: [
          { text: '按要求下载会议软件并打开屏幕共享。', nextNodeId: 'open_screenshare', riskChange: 60, moneyChange: -20000 },
          { text: '退款为什么还要屏幕共享？直接打到我微信钱包不行吗？', nextNodeId: 'doubt_screenshare', riskChange: -10 }
        ]
      },
      doubt_screenshare: {
        id: 'doubt_screenshare',
        speaker: '客服工号089',
        role: '伪装专业解释',
        sceneDescription: '对方拿出了看似专业但充满破绽的“资金流水清算”说辞。',
        dialogue: '因为这是民航专项津贴，必须进行对公电子回执核销，屏幕共享只是为了指导您点击合规按钮，我们绝不会窥探您的密码。如果您不配合，我们将视为您恶意阻挠理赔流程。',
        choices: [
          { text: '半信半疑，还是打开了屏幕共享并登录了手机银行。', nextNodeId: 'open_screenshare', riskChange: 70, moneyChange: -50000 },
          { text: '屏幕共享是诈骗的高危标志，坚决拒绝并拨打96110！', nextNodeId: 'call_96110_success', riskChange: -60 }
        ]
      },
      open_screenshare: {
        id: 'open_screenshare',
        speaker: '系统警报',
        role: '风险触发',
        sceneDescription: '在你开启屏幕共享并打开手机银行App的瞬间，骗子后台远程捕获了你的银行卡号、短信验证码和人脸识别提示！',
        dialogue: '【中国银行短信】：您尾号8842账户于20:31完成银联快捷支付 50,000.00元，余额 0.00元。',
        choices: [
          { text: '查看结局评估', nextNodeId: 'end_scammed', riskChange: 100 }
        ]
      },
      end_scammed: {
        id: 'end_scammed',
        speaker: '实训结局',
        role: '破案法证记录',
        dialogue: '【实训判定：遭遇电信诈骗，资金损失惨重】',
        isEnding: true,
        endingType: 'scammed',
        endingTitle: '轻信改签·屏幕共享资金被洗劫',
        endingSummary: '由于在诈骗分子诱导下开启了“屏幕共享”，手机银行验证码被实时截获，导致账户内全部资金被转走。切记：凡是退款要求开启屏幕共享的，100%是诈骗！',
        choices: []
      },
      official_success: {
        id: 'official_success',
        speaker: '实训结局',
        role: '警惕防线',
        dialogue: '你直接打开官方航空公司App并咨询了在线客服，客服告知该航班一切正常并未取消。你成功避免了一起精心策划的机票改签诈骗！',
        isEnding: true,
        endingType: 'success',
        endingTitle: '沉着冷静·官方渠道成功识破骗局',
        endingSummary: '你坚持通过官方渠道核实信息，没有被对方制造的时间紧迫感所迷惑，表现出极强的反诈防御素养。',
        choices: []
      },
      call_96110_success: {
        id: 'call_96110_success',
        speaker: '实训结局',
        role: '模范防范',
        dialogue: '你立即挂断电话并拨打了96110反诈专线。警方确认该电话为境外改号诈骗电话，并将涉案号码纳入反诈黑名单库！',
        isEnding: true,
        endingType: 'alerted',
        endingTitle: '火眼金睛·协助反诈中心精准拦截',
        endingSummary: '你敏锐识别出“屏幕共享”这一诈骗核心破绽，并在第一时间联动官方反诈力量，防骗能力评级为 S 级！',
        choices: []
      }
    }
  },
  {
    id: 'brush_order',
    title: '暴利陷阱：日赚800元的刷单噩梦',
    type: '刷单返利兼职骗局',
    tag: '大学生/宝妈易中招',
    description: '微信群里有人分享了“给短视频点赞即领5元佣金”的兼职任务，开头确实秒到账了...',
    initialFunds: 30000,
    nodes: {
      start: {
        id: 'start',
        speaker: '兼职派单员-小雪',
        role: '热情导师',
        sceneDescription: '你加入了一个兼职交流群，派单员私信你发来新手福利任务。',
        dialogue: '亲，今天抖音快手点赞任务火热招募！每关注点赞3个博主即可截图结算15元红包，一分钟一单，随时提现。想做的话发个“1”，我发第一批任务给你！',
        choices: [
          { text: '反正是随手点赞，先做3单试试看。', nextNodeId: 'small_profit', riskChange: 15 },
          { text: '天上不会掉馅饼，所有网络刷单都是违法的，退群。', nextNodeId: 'quit_early_success', riskChange: -40 }
        ]
      },
      small_profit: {
        id: 'small_profit',
        speaker: '兼职派单员-小雪',
        role: '返利到账',
        sceneDescription: '你做完了3个点赞，微信果然收到了15元红包转账。随后对方把你拉进了一个“高级VIP垫付单群”。',
        dialogue: '亲太棒了！基础点赞单名额满了，现在开放“海外商城代采购充值返利单”，充值1000返1200，充值5000返6200！群里很多宝妈每天赚两三千，你要不要试试进阶单？',
        choices: [
          { text: '既然之前真给钱了，充值1000试试。', nextNodeId: 'medium_recharge', riskChange: 40, moneyChange: -1000 },
          { text: '前面给小钱是为了钓大鱼，直接拉黑！', nextNodeId: 'brush_success', riskChange: -30 }
        ]
      },
      medium_recharge: {
        id: 'medium_recharge',
        speaker: '平台财务总监',
        role: '制造提现障碍',
        sceneDescription: '你在对方提供的专用App充值了1000元，App余额显示1250元，但点击提现时系统提示“操作失误，账户冻结”。',
        dialogue: '【系统提示】：由于您未严格按照规定时间完成联名连环单，系统已自动锁定提现通道。必须在30分钟内追加补单20,000元解冻资金，完成后本金加利息共返还26,000元，逾期将清零！',
        choices: [
          { text: '怕之前的钱打水漂，四处借钱追加20,000元解冻。', nextNodeId: 'brush_loss_end', riskChange: 80, moneyChange: -20000 },
          { text: '意识到这是经典的连环套诈骗，立即止损并去派出所报案！', nextNodeId: 'brush_stop_loss', riskChange: -20 }
        ]
      },
      brush_loss_end: {
        id: 'brush_loss_end',
        speaker: '实训结局',
        role: '惨痛教训',
        dialogue: '追加充值后，对方又以“信誉分不足”、“需要缴纳个人所得税”等理由继续索要5万元，此时你已被掏空积蓄。',
        isEnding: true,
        endingType: 'scammed',
        endingTitle: '沉没成本诱惑·深陷连环刷单深渊',
        endingSummary: '刷单诈骗的核心套路就是“前期小利诱惑，后期以连环单、解冻费大肆吞没”。切记：所有刷单都是诈骗，垫付本金就是送钱！',
        choices: []
      },
      brush_stop_loss: {
        id: 'brush_stop_loss',
        speaker: '实训结局',
        role: '及时止损',
        dialogue: '虽然损失了首期1000元，但你果断刹车，没有落入后续两万乃至数万元的解冻金圈套，并配合警方锁定了骗子收款账号。',
        isEnding: true,
        endingType: 'alerted',
        endingTitle: '当机立断·斩断连环索财套路',
        endingSummary: '你克服了沉没成本心理，在关键时刻及时止损，避免了数万元的灾难性损失。',
        choices: []
      },
      quit_early_success: {
        id: 'quit_early_success',
        speaker: '实训结局',
        role: '源头免疫',
        dialogue: '你从一开始就深刻明白“刷单即诈骗”的铁律，根本不给骗子任何用蝇头小利建立心理信任的机会。',
        isEnding: true,
        endingType: 'success',
        endingTitle: '绝对清醒·从源头粉碎贪念陷阱',
        endingSummary: '具备最高等级的防贪婪免疫力，反诈综合指数满分！',
        choices: []
      },
      brush_success: {
        id: 'brush_success',
        speaker: '实训结局',
        role: '机敏识破',
        dialogue: '你拿到了骗子的15元诱饵红包并果断反手拉黑举报。骗子不仅没骗到你的钱，反而倒贴了15元成本！',
        isEnding: true,
        endingType: 'success',
        endingTitle: '反客为主·机敏反杀刷单诱饵',
        endingSummary: '看穿了骗子“放长线钓大鱼”的心理战术，安全撤退。',
        choices: []
      }
    }
  }
];

export const INITIAL_ANALYTICS_DATA = {
  overallIndex: 88,
  totalSimulations: 6,
  successRate: 83.3,
  blockedLossAmount: 320000,
  dimensions: [
    { name: '权威威慑抗压', score: 86, desc: '面对公检法、领导施压时保持冷静理性的能力' },
    { name: '贪利诱惑防御', score: 92, desc: '对高收益理财、兼职刷单等诱饵的免疫程度' },
    { name: '官方渠道验证', score: 82, desc: '遇到突发事件主动拨打官方客服/96110核验的习惯' },
    { name: '隐私防线坚固度', score: 90, desc: '绝不泄露验证码、银行卡密码及不轻易开屏幕共享' },
    { name: '急迫话术拆解力', score: 88, desc: '识破“最后时限”、“秘密调查”等心理催促套路的能力' },
  ],
  historyRecords: [
    {
      id: 'REC-20260824-01',
      date: '2026-08-24 19:45',
      type: '模拟来电',
      scenario: '冒充公检法洗钱案',
      score: 92,
      result: '成功识破',
      duration: '03分12秒',
      riskKeywords: ['安全账户', '涉案恐吓'],
    },
    {
      id: 'REC-20260823-02',
      date: '2026-08-23 15:20',
      type: '互动剧场',
      scenario: '迷雾航班：300元理赔金',
      score: 85,
      result: '官方渠道核实',
      duration: '04分45秒',
      riskKeywords: ['屏幕共享', '改签退款'],
    },
    {
      id: 'REC-20260822-03',
      date: '2026-08-22 10:11',
      type: '模拟来电',
      scenario: '微信百万保障到期',
      score: 95,
      result: '完美防御',
      duration: '02分38秒',
      riskKeywords: ['自动扣费', '取消保险'],
    }
  ]
};
