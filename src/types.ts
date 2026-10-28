export type ActiveView = 'home' | 'analytics' | 'history';

export type ActiveModule = 'none' | 'call' | 'theater' | 'qa' | 'report';

export interface CallScenario {
  id: string;
  title: string;
  badge: string;
  callerName: string;
  callerNumber: string;
  description: string;
  openingLine: string;
  stressFactor: string;
  dangerKeywords: string[];
}

export interface ConversationTurn {
  id: string;
  sender: 'caller' | 'user' | 'system';
  text: string;
  timestamp: string;
  stressLevel?: number;
  tactics?: string[];
}

export interface ForensicReport {
  caseNumber: string;
  timestamp: string;
  scenarioTitle: string;
  durationSeconds: number;
  overallScore: number;
  riskLevel: '极低风险' | '中低风险' | '中等风险' | '高危易受骗';
  radarScores: {
    authorityResistance: number;
    greedResistance: number;
    verificationHabit: number;
    privacyAwareness: number;
    urgencyComposure: number;
  };
  detectedVulnerabilities: string[];
  scamPointsExposed: string[];
  expertSuggestions: string[];
  conversationLog: ConversationTurn[];
}

export interface TheaterChoice {
  text: string;
  nextNodeId: string;
  riskChange: number;
  moneyChange?: number;
  clue?: string;
}

export interface TheaterNode {
  id: string;
  speaker: string;
  role: string;
  dialogue: string;
  sceneDescription?: string;
  choices: TheaterChoice[];
  isEnding?: boolean;
  endingType?: 'success' | 'scammed' | 'alerted';
  endingTitle?: string;
  endingSummary?: string;
}

export interface TheaterStory {
  id: string;
  title: string;
  type: string;
  tag: string;
  description: string;
  initialFunds: number;
  nodes: Record<string, TheaterNode>;
}

export interface AppConfig {
  appKey: string;
  visitorId: string;
  ttsVoice: 'xiaolan' | 'xiaoqing' | 'xiaoyue' | 'shuyan' | 'zimo' | 'qinghe';
  soundEnabled: boolean;
  aiAssistance: boolean;
}
