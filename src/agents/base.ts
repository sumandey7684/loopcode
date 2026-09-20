export enum AgentRole {
  PLANNER = 'planner',
  RESEARCHER = 'researcher',
  ENGINEER = 'engineer',
  REVIEWER = 'reviewer',
  VERIFIER = 'verifier',
}

export interface AgentConfig {
  role: AgentRole;
  modelID: string;
  providerID: string;
  count?: number;
}

export interface AgentState {
  id: string;
  role: AgentRole;
  sessionId: string;
  model: string;
  taskId: string;
  status: 'idle' | 'working' | 'done' | 'failed';
  cost: number;
}
