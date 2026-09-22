"use client";

import { normalizeBriefing, type BriefingSpec } from "@/lib/briefing";
import { normalizeWorkspace, type CampaignWorkspaceDraft } from "@/lib/campaignWorkspace";

export interface CampaignTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  briefing: BriefingSpec;
  candidateTargetPerNarrative: number;
  notes: string;
}

const STORAGE_KEY = "kastriva-ai-clipper-campaign-templates-v1";
const MAX_TEMPLATES = 20;

function safeParse(raw: string | null): CampaignTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CampaignTemplate[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => ({
      id: String(item?.id || `template-${index + 1}`).slice(0, 80),
      name: String(item?.name || `Template ${index + 1}`).slice(0, 120),
      createdAt: Math.max(0, Number(item?.createdAt || Date.now())),
      updatedAt: Math.max(0, Number(item?.updatedAt || Date.now())),
      briefing: normalizeBriefing(item?.briefing),
      candidateTargetPerNarrative: Math.max(1, Math.min(4, Number(item?.candidateTargetPerNarrative || 2))),
      notes: String(item?.notes || "").slice(0, 4000),
    })).slice(0, MAX_TEMPLATES);
  } catch {
    return [];
  }
}

export function listCampaignTemplates() {
  if (typeof window === "undefined") return [] as CampaignTemplate[];
  return safeParse(window.localStorage.getItem(STORAGE_KEY)).sort((a, b) => b.updatedAt - a.updatedAt);
}

function writeTemplates(items: CampaignTemplate[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_TEMPLATES)));
}

export function saveCampaignTemplate(input: {
  id?: string;
  name: string;
  briefing: BriefingSpec;
  workspace: CampaignWorkspaceDraft;
}) {
  if (typeof window === "undefined") throw new Error("Template hanya tersedia di browser.");
  const current = listCampaignTemplates();
  const now = Date.now();
  const id = input.id || crypto.randomUUID();
  const previous = current.find((item) => item.id === id);
  const workspace = normalizeWorkspace(input.workspace);
  const next: CampaignTemplate = {
    id,
    name: String(input.name || input.briefing.campaignName || "Campaign Template").trim().slice(0, 120) || "Campaign Template",
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    briefing: normalizeBriefing({ ...input.briefing, targetSpeakerIndex: null }),
    candidateTargetPerNarrative: workspace.candidateTargetPerNarrative,
    notes: workspace.notes,
  };
  writeTemplates([next, ...current.filter((item) => item.id !== id)]);
  return next;
}

export function deleteCampaignTemplate(id: string) {
  if (typeof window === "undefined") return;
  writeTemplates(listCampaignTemplates().filter((item) => item.id !== id));
}

export function applyCampaignTemplate(template: CampaignTemplate, workspaceInput?: CampaignWorkspaceDraft | null) {
  const workspace = normalizeWorkspace(workspaceInput);
  return {
    briefing: normalizeBriefing({ ...template.briefing, enabled: true, targetSpeakerIndex: null }),
    workspace: {
      ...workspace,
      enabled: true,
      focusedNarrative: null,
      candidateTargetPerNarrative: template.candidateTargetPerNarrative,
      notes: template.notes,
      manualReviewDone: [],
    } satisfies CampaignWorkspaceDraft,
  };
}
