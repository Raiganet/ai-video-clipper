import type { CaptionCue, CaptionStyle } from "@/lib/captions";
import type { CropFocus, CropTrack } from "@/lib/faceTracking";
import type { BrandingSettings } from "@/lib/branding";
import type { VideoMetadata } from "@/lib/ffmpeg";
import type { TranscriptSegment } from "@/lib/transcription";
import type { ClipperSettings } from "@/components/SettingsPanel";
import type { SocialTemplateId } from "@/lib/socialTemplates";
import type { ClipSocialMetadata } from "@/lib/clipMetadata";
import type { BriefingSpec } from "@/lib/briefing";
import type { CampaignWorkspaceDraft } from "@/lib/campaignWorkspace";
import type { CampaignSubmissionDraft } from "@/lib/submissionManager";

export interface PersistedClip {
  id: number;
  title: string;
  start: number;
  duration: number;
  isAiDetected: boolean;
  score: number;
  reason?: string;
  briefingNarrative?: string;
  briefingFlags?: string[];
  sourceId?: string;
  sourceName?: string;
  sourceDuration?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface ProjectDraft {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceName: string;
  sourceType: string;
  sourceSize: number;
  sourceLastModified: number;
  sourceStored: boolean;
  videoMeta: VideoMetadata | null;
  captionStyle: CaptionStyle;
  transcriptSegments: TranscriptSegment[];
  clipTranscriptSegments?: Record<number, TranscriptSegment[]>;
  captionOverrides: Record<number, CaptionCue[]>;
  faceFocuses: Record<number, CropFocus>;
  faceTracks?: Record<number, CropTrack>;
  branding?: BrandingSettings;
  socialTemplateId?: SocialTemplateId | null;
  clipMetadata?: Record<number, ClipSocialMetadata>;
  briefing?: BriefingSpec;
  campaignWorkspace?: CampaignWorkspaceDraft;
  campaignSubmission?: CampaignSubmissionDraft;
  settings: ClipperSettings;
  clips: PersistedClip[];
  selectedId: number | null;
}

export interface LoadedProject {
  draft: ProjectDraft;
  sourceFile: File | null;
  campaignSourceFiles?: Record<string, File>;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  sourceName: string;
  sourceSize: number;
  sourceStored: boolean;
  clipCount: number;
}

export interface CloudProjectSummary extends ProjectSummary {
  cloudUpdatedAt: number;
  compressedBytes: number;
}
