export interface CrmStage {
  id: string;
  workspaceId: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

export interface CrmLead {
  id: string;
  workspaceId: string;
  stageId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  interest: string | null;
  estimatedValue: number | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  firstTouchSource: string | null;
  firstTouchMedium: string | null;
  firstTouchCampaign: string | null;
  lastTouchSource: string | null;
  lastTouchMedium: string | null;
  lastTouchCampaign: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  ownerUserId: string | null;
  integrationId: string | null;
  externalLeadId: string | null;
  visitorId: string | null;
  status: string;
  lostReason: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CrmLeadInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  interest?: string | null;
  estimated_value?: number | null;
  stage_id?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  owner_user_id?: string | null;
  lost_reason?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}
