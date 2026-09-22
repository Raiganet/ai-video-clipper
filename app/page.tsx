"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { AlertTriangle, Brain, Captions, CreditCard, Database, Download, FolderOpen, Loader2, Play, RefreshCw, Save, ScanFace, Scissors, ShieldCheck, Sparkles, Square, Upload, UserRound } from "lucide-react";
import YouTubeInput from "@/components/YouTubeInput";
import VideoUploader from "@/components/VideoUploader";
import CaptionStyleSelector from "@/components/CaptionStyleSelector";
import ClipEditor from "@/components/ClipEditor";
import SettingsPanel, { ClipperSettings } from "@/components/SettingsPanel";
import BrandingPanel from "@/components/BrandingPanel";
import SocialTemplateSelector from "@/components/SocialTemplateSelector";
import ClipPublishPanel from "@/components/ClipPublishPanel";
import ExportPanel from "@/components/ExportPanel";
import BriefingPanel from "@/components/BriefingPanel";
import BriefCompliancePanel from "@/components/BriefCompliancePanel";
import CampaignWorkspace from "@/components/CampaignWorkspace";
import ProjectHistory from "@/components/ProjectHistory";
import AccountPanel from "@/components/AccountPanel";
import PwaInstallButton from "@/components/PwaInstallButton";
import { getOutputSize, getVideoMetadata, renderVideoClip, type RenderClipOptions, type VideoMetadata } from "@/lib/ffmpeg";
import { detectViralMoments, ViralMoment } from "@/lib/viralDetector";
import { transcribeVideo, type TranscriptSegment } from "@/lib/transcription";
import { buildCaptionCues, type CaptionCue, type CaptionStyle } from "@/lib/captions";
import { detectFaceFocus, detectFaceTrack, type CropFocus, type CropTrack } from "@/lib/faceTracking";
import { brandingKey, DEFAULT_BRANDING, normalizeBranding, type BrandingSettings } from "@/lib/branding";
import { canPersistSource, loadProject, notifyProjectsChanged, saveProject } from "@/lib/projects";
import { syncProjectToCloud } from "@/lib/cloudProjects";
import { trackAnalytics } from "@/lib/analytics";
import type { ProjectDraft } from "@/lib/projectTypes";
import { renderVideoClipRemote } from "@/lib/renderWorker";
import type { SocialTemplate, SocialTemplateId } from "@/lib/socialTemplates";
import type { ClipSocialMetadata } from "@/lib/clipMetadata";
import { EMPTY_BRIEFING, buildBriefCandidates, evaluateBriefCompliance, localRankBriefCandidates, normalizeBriefing, transcriptForRange, type BriefingSpec } from "@/lib/briefing";
import { EMPTY_WORKSPACE, chooseCampaignWorkspaceMoments, normalizeWorkspace, upsertWorkspaceSource, type CampaignWorkspaceDraft } from "@/lib/campaignWorkspace";
import { rankBriefCandidates } from "@/lib/briefingClient";

interface Clip {
  id: number;
  title: string;
  start: number;
  duration: number;
  blobUrl: string | null;
  processing: boolean;
  isAiDetected: boolean;
  score: number;
  reason?: string;
  renderSignature: string | null;
  briefingNarrative?: string;
  briefingFlags?: string[];
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function basicSplit(duration: number, count: number): ViralMoment[] {
  const safeCount = Math.max(1, Math.min(count, Math.ceil(duration / 5)));
  const spacing = duration / safeCount;
  return Array.from({ length: safeCount }, (_, index) => {
    const start = index * spacing;
    const clipDuration = Math.min(30, spacing);
    return {
      start,
      end: Math.min(duration, start + Math.max(5, clipDuration)),
      score: 0.5,
      title: `Bagian ${index + 1}`,
      isAiDetected: false,
      reason: "pembagian otomatis",
    };
  });
}

function cueKey(cues: CaptionCue[]) {
  if (cues.length === 0) return "no-cues";
  let hash = 2166136261;
  const raw = cues.map((cue) => `${cue.start.toFixed(2)}|${cue.end.toFixed(2)}|${cue.speaker ?? "-"}|${cue.text}`).join("~");
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function renderSignature(
  clip: Pick<Clip, "start" | "duration">,
  captionStyle: CaptionStyle,
  settings: Pick<ClipperSettings, "crop" | "smartCrop" | "renderMode">,
  cues: CaptionCue[],
  branding: BrandingSettings,
  briefing: BriefingSpec
) {
  const effectiveCaption = captionStyle === "none" || cues.length === 0 ? "none" : captionStyle;
  return [
    "v12",
    settings.crop,
    settings.smartCrop,
    settings.renderMode,
    effectiveCaption,
    clip.start.toFixed(2),
    clip.duration.toFixed(2),
    cueKey(cues),
    brandingKey(branding),
    briefing.enabled ? `brief:${briefing.ctaText}|${briefing.ctaDuration}` : "brief:off",
  ].join("|");
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"youtube" | "upload">("upload");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("karaoke");
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [captionOverrides, setCaptionOverrides] = useState<Record<number, CaptionCue[]>>({});
  const [faceFocuses, setFaceFocuses] = useState<Record<number, CropFocus>>({});
  const [faceTracks, setFaceTracks] = useState<Record<number, CropTrack>>({});
  const [branding, setBranding] = useState<BrandingSettings>({ ...DEFAULT_BRANDING });
  const [brandingReady, setBrandingReady] = useState(false);
  const [socialTemplateId, setSocialTemplateId] = useState<SocialTemplateId | null>(null);
  const [settings, setSettings] = useState<ClipperSettings>({
    previewCount: 5,
    vibe: "viral",
    crop: "auto",
    smartCrop: "dynamic",
    aiMode: "transcript",
    speakerMode: "off",
    renderMode: "auto",
  });
  const [status, setStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectCreatedAt, setProjectCreatedAt] = useState<number>(Date.now());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cloudState, setCloudState] = useState<"idle" | "syncing" | "synced" | "conflict" | "error">("idle");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [clipMetadata, setClipMetadata] = useState<Record<number, ClipSocialMetadata>>({});
  const [briefing, setBriefing] = useState<BriefingSpec>({ ...EMPTY_BRIEFING });
  const [campaignWorkspace, setCampaignWorkspace] = useState<CampaignWorkspaceDraft>({ ...EMPTY_WORKSPACE });
  const renderControllersRef = useRef<Map<number, AbortController>>(new Map());
  const batchCancelRef = useRef(false);
  const clipsRef = useRef<Clip[]>([]);

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedId) || null,
    [clips, selectedId]
  );

  const outputInfo = useMemo(() => {
    if (!videoMeta) return null;
    return getOutputSize(settings.crop, videoMeta.width, videoMeta.height);
  }, [settings.crop, videoMeta]);

  const speakerCount = useMemo(
    () => new Set(transcriptSegments.map((segment) => segment.speaker).filter((value): value is number => typeof value === "number")).size,
    [transcriptSegments]
  );

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("clipper-branding-preset-v1");
      if (saved) setBranding(normalizeBranding(JSON.parse(saved) as Partial<BrandingSettings>));
    } catch {
      // Preset branding opsional; project tetap berjalan jika localStorage diblokir.
    } finally {
      setBrandingReady(true);
    }
  }, []);

  useEffect(() => {
    if (!brandingReady) return;
    try {
      window.localStorage.setItem("clipper-branding-preset-v1", JSON.stringify(branding));
    } catch {
      // Abaikan kegagalan storage preset.
    }
  }, [branding, brandingReady]);

  useEffect(() => {
    return () => {
      clipsRef.current.forEach((clip) => {
        if (clip.blobUrl) URL.revokeObjectURL(clip.blobUrl);
      });
    };
  }, []);

  const getCuesForClip = (clip: Clip, segments = transcriptSegments) => {
    const custom = captionOverrides[clip.id];
    if (custom) return custom;
    return buildCaptionCues(segments, clip.start, clip.duration, captionStyle);
  };

  const getCurrentSignature = (clip: Clip) => (
    renderSignature(clip, captionStyle, settings, getCuesForClip(clip), branding, briefing)
  );

  const resetClips = () => {
    setClips((previous) => {
      previous.forEach((clip) => {
        if (clip.blobUrl) URL.revokeObjectURL(clip.blobUrl);
      });
      return [];
    });
    setCaptionOverrides({});
    setFaceFocuses({});
    setFaceTracks({});
    setClipMetadata({});
    setSelectedId(null);
  };

  const handleUpload = (file: File | null) => {
    if (file && projectId && !uploadedVideo) {
      setUploadedVideo(file);
      setCampaignWorkspace((previous) => upsertWorkspaceSource(previous, file));
      setSaveState("idle");
      setCloudState("idle");
      setWarning("");
      setStatus("Video sumber ditautkan kembali ke draft. Render preview dapat dilanjutkan.");
      void getVideoMetadata(file).then(setVideoMeta).catch(() => undefined);
      return;
    }
    resetClips();
    setWarning("");
    setStatus("");
    setProgress(0);
    setTranscriptSegments([]);
    setVideoMeta(null);
    setUploadedVideo(file);
    setCampaignWorkspace((previous) => file ? upsertWorkspaceSource(previous, file) : previous);
    setCloudState("idle");
    if (file) {
      const now = Date.now();
      setProjectId(crypto.randomUUID());
      setProjectCreatedAt(now);
      setProjectName(file.name.replace(/\.[^.]+$/, "") || "Project Baru");
      setSaveState("idle");
    } else {
      setProjectId(null);
      setProjectName("");
      setSaveState("idle");
    }
  };

  const processClip = async (
    clip: Clip,
    file: File,
    meta: VideoMetadata,
    segments: TranscriptSegment[],
    onProgress?: (percent: number, phase: "captions" | "render") => void,
    signal?: AbortSignal
  ) => {
    const renderStartedAt = performance.now();
    setClips((previous) => previous.map((item) => item.id === clip.id ? { ...item, processing: true } : item));
    const cues = captionOverrides[clip.id] ?? buildCaptionCues(segments, clip.start, clip.duration, captionStyle);
    const effectiveCaptionStyle: CaptionStyle = captionStyle !== "none" && cues.length > 0 ? captionStyle : "none";
    const signature = renderSignature(clip, captionStyle, settings, cues, branding, briefing);

    let cropFocus: CropFocus = faceFocuses[clip.id] ?? {
      x: 0.5,
      y: 0.5,
      confidence: 0,
      detectedSamples: 0,
      totalSamples: 0,
      mode: "center",
    };
    let cropTrack: CropTrack | undefined = faceTracks[clip.id];

    if (settings.smartCrop === "dynamic" && settings.crop !== "original" && !cropTrack) {
      try {
        setStatus("Active Subject: melacak posisi wajah dominan...");
        setProgress(2);
        cropTrack = await detectFaceTrack(file, clip.start, clip.duration, (percent) => {
          setProgress(Math.max(2, Math.round(percent * 0.12)));
        });
        cropFocus = cropTrack;
        setFaceTracks((previous) => ({ ...previous, [clip.id]: cropTrack! }));
        setFaceFocuses((previous) => ({ ...previous, [clip.id]: cropTrack! }));
      } catch (error) {
        console.warn("Active Subject failed, using center crop", error);
        cropTrack = undefined;
        cropFocus = { ...cropFocus, mode: "center" };
        setWarning("Dynamic tracking tidak tersedia di browser/jaringan ini. Render tetap dilanjutkan dengan center-crop.");
      }
    } else if (settings.smartCrop === "face" && settings.crop !== "original" && !faceFocuses[clip.id]) {
      try {
        setStatus("Smart Face: mencari posisi subjek...");
        setProgress(2);
        cropFocus = await detectFaceFocus(file, clip.start, clip.duration, (percent) => {
          setProgress(Math.max(2, Math.round(percent * 0.12)));
        });
        setFaceFocuses((previous) => ({ ...previous, [clip.id]: cropFocus }));
      } catch (error) {
        console.warn("Smart Face failed, using center crop", error);
        cropFocus = { ...cropFocus, mode: "center" };
        setFaceFocuses((previous) => ({ ...previous, [clip.id]: cropFocus }));
        setWarning("Smart Face tidak dapat dimuat di browser/jaringan ini. Render tetap dilanjutkan dengan center-crop.");
      }
    }

    try {
      if (briefing.enabled && briefing.requireLogo && (!branding.enabled || !branding.logoDataUrl)) {
        throw new Error("Briefing mewajibkan logo di semua video. Aktifkan Branding dan upload logo sebelum render.");
      }
      const renderOptions: RenderClipOptions = {
        start: clip.start,
        duration: clip.duration,
        ratio: settings.crop,
        captionStyle: effectiveCaptionStyle,
        transcriptSegments: segments,
        captionCues: cues,
        cropFocus: settings.smartCrop === "center" ? { x: 0.5, y: 0.5 } : cropFocus,
        cropTrack: settings.smartCrop === "dynamic" && cropTrack?.mode === "face" ? cropTrack.points : undefined,
        branding,
        ctaOverlay: briefing.enabled && briefing.ctaText.trim() ? { enabled: true, text: briefing.ctaText.trim(), duration: briefing.ctaDuration } : undefined,
        sourceWidth: meta.width,
        sourceHeight: meta.height,
        onProgress,
      };
      const preferWorker = settings.renderMode === "worker" || (settings.renderMode === "auto" && (file.size > 220 * 1024 * 1024 || meta.duration > 15 * 60));
      let blob: Blob;
      if (preferWorker) {
        try {
          setStatus("Mengirim video ke FFmpeg render worker...");
          blob = await renderVideoClipRemote(file, renderOptions, signal);
        } catch (workerError) {
          if ((workerError as Error)?.name === "AbortError" || signal?.aborted) throw workerError;
          if (settings.renderMode === "worker") throw workerError;
          const tooLargeForSafeFallback = file.size > 450 * 1024 * 1024 || meta.duration > 30 * 60;
          if (tooLargeForSafeFallback) {
            throw new Error(`${workerError instanceof Error ? workerError.message : "Render worker tidak tersedia."} Browser fallback dilewati karena video terlalu besar; aktifkan render worker atau gunakan file yang lebih kecil.`);
          }
          console.warn("Render worker unavailable, falling back to browser", workerError);
          setWarning(`${workerError instanceof Error ? workerError.message : "Render worker tidak tersedia."} Fallback ke Browser Render.`);
          blob = await renderVideoClip(file, renderOptions);
        }
      } else {
        blob = await renderVideoClip(file, renderOptions);
      }
      const url = URL.createObjectURL(blob);
      setClips((previous) => previous.map((item) => {
        if (item.id !== clip.id) return item;
        if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
        return { ...item, blobUrl: url, processing: false, renderSignature: signature };
      }));
      void trackAnalytics("render_success", { ratio: settings.crop, caption: effectiveCaptionStyle, smartCrop: settings.smartCrop, durationSec: Math.round(clip.duration * 10) / 10, renderMs: Math.round(performance.now() - renderStartedAt) });
    } catch (error) {
      setClips((previous) => previous.map((item) => item.id === clip.id ? { ...item, processing: false } : item));
      void trackAnalytics("render_error", { ratio: settings.crop, caption: effectiveCaptionStyle, smartCrop: settings.smartCrop, durationSec: Math.round(clip.duration * 10) / 10, message: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
      throw error;
    }
  };

  const handleFindPreviews = async () => {
    if (!uploadedVideo) return;

    const reusableBriefSegments = briefing.enabled ? transcriptSegments : [];
    setBusy(true);
    resetClips();
    setProgress(0);
    setWarning("");
    setTranscriptSegments([]);

    try {
      setStatus("Membaca metadata video...");
      const metadata = await getVideoMetadata(uploadedVideo);
      setVideoMeta(metadata);
      const duration = metadata.duration;
      if (!duration || duration <= 0) throw new Error("Durasi video tidak valid");

      let moments: ViralMoment[];
      let segmentsForRender: TranscriptSegment[] = [];
      const briefingMomentMeta = new Map<string, { narrative: string; flags: string[] }>();
      const effectiveBriefing = briefing.enabled && campaignWorkspace.enabled && campaignWorkspace.focusedNarrative
        ? normalizeBriefing({ ...briefing, requiredNarratives: [campaignWorkspace.focusedNarrative] })
        : briefing;
      if (briefing.enabled && !briefing.analyzedAt) throw new Error("Briefing aktif tetapi belum dianalisis. Klik Analisis Briefing terlebih dahulu.");

      if (settings.aiMode === "transcript") {
        try {
          const needsDiarization = settings.speakerMode === "diarize" || (effectiveBriefing.enabled && effectiveBriefing.requireTargetSpeaker);
          let workingSegments: TranscriptSegment[];
          let detectedSpeakerCount = 0;
          if (briefing.enabled && reusableBriefSegments.length > 0) {
            workingSegments = reusableBriefSegments;
            detectedSpeakerCount = new Set(workingSegments.map((segment) => segment.speaker).filter((value): value is number => typeof value === "number")).size;
            setStatus("Menggunakan transcript yang sudah ada untuk ranking briefing ulang...");
            setProgress(78);
          } else {
            setStatus("Menyiapkan audio 16 kHz untuk AI...");
            const transcript = await transcribeVideo(uploadedVideo, duration, ({ phase, percent, current, total }) => {
              if (phase === "extract") {
                setStatus(`Mengekstrak audio ${current}/${total}...`);
                setProgress(Math.round(percent * 0.4));
              } else {
                setStatus(`${needsDiarization ? "Speaker diarization" : "Transkripsi AI"} ${current}/${total}...`);
                setProgress(40 + Math.round(percent * 0.38));
              }
            }, { speakerDiarization: needsDiarization, language: "id" });
            if (transcript.fallbackReason) setWarning(`${transcript.fallbackReason} Sistem otomatis memakai transkripsi Groq tanpa label speaker.`);
            else if (transcript.diarized) setStatus(`Diarization selesai: ${transcript.speakerCount} speaker terdeteksi. Menganalisis momen...`);
            workingSegments = transcript.segments;
            detectedSpeakerCount = transcript.speakerCount;
          }
          segmentsForRender = workingSegments;
          setTranscriptSegments(workingSegments);
          setStatus(briefing.enabled ? "Mencocokkan transcript dengan briefing campaign..." : "Menganalisis timestamp dan memilih momen terbaik...");
          setProgress(80);
          if (effectiveBriefing.enabled) {
            const candidates = buildBriefCandidates(workingSegments, duration, effectiveBriefing, Math.max(18, Math.max(settings.previewCount, effectiveBriefing.requiredNarratives.length || 0) * 4));
            if (candidates.length === 0) throw new Error(`Tidak ada section yang memenuhi durasi briefing ${effectiveBriefing.durationMin}–${effectiveBriefing.durationMax} detik.`);
            let rankings;
            try {
              rankings = await rankBriefCandidates(effectiveBriefing, candidates);
            } catch (rankError) {
              console.warn("Briefing AI ranking failed, using local rank", rankError);
              rankings = localRankBriefCandidates(candidates, effectiveBriefing);
            }
            const selected = chooseCampaignWorkspaceMoments({
              brief: effectiveBriefing,
              candidates,
              rankings,
              maxClips: Math.max(settings.previewCount, effectiveBriefing.requiredNarratives.length || 0),
              focusedNarrative: campaignWorkspace.enabled ? campaignWorkspace.focusedNarrative : null,
              maxPerNarrative: campaignWorkspace.enabled ? 2 : 1,
            });
            if (selected.length === 0) throw new Error("Tidak ada section yang lolos aturan briefing. Cek larangan atau rentang durasi.");
            moments = selected.map((item) => {
              briefingMomentMeta.set(item.start.toFixed(2), { narrative: item.narrative, flags: item.flags });
              return { start: item.start, end: item.end, score: item.score, title: item.title, isAiDetected: true, reason: item.reason } satisfies ViralMoment;
            });
            if (effectiveBriefing.requireTargetSpeaker && effectiveBriefing.targetSpeakerIndex === null && detectedSpeakerCount > 1) {
              setWarning(`Draft sudah dibuat sesuai narasi briefing, tetapi ${effectiveBriefing.targetSubject || "target speaker"} belum ditag. Pilih Speaker 1/2/... di Briefing-Aware Clipper lalu cari ulang agar fokus speaker lebih akurat.`);
            }
          } else {
            moments = detectViralMoments(
              workingSegments,
              duration,
              settings.previewCount,
              settings.vibe
            );
          }
        } catch (error) {
          if (briefing.enabled) throw error;
          console.warn("AI transcription failed; using safe split fallback", error);
          const message = error instanceof Error ? error.message : "Transkripsi AI gagal";
          void trackAnalytics("transcribe_error", { message: message.slice(0, 120), sourceMb: Math.round(uploadedVideo.size / 1024 / 1024) });
          setWarning(`${message}. Sistem memakai Pembagian cepat; caption otomatis tidak tersedia.`);
          moments = basicSplit(duration, settings.previewCount);
        }
      } else {
        if (briefing.enabled) throw new Error("Briefing-Aware Clipper membutuhkan mode AI + Timestamp. Ubah AI Mode dari Pembagian cepat.");
        setStatus("Membagi video tanpa AI...");
        moments = basicSplit(duration, settings.previewCount);
      }

      const generated: Clip[] = moments.map((moment, index) => ({
        id: index + 1,
        title: moment.title,
        start: moment.start,
        duration: Math.max(0.1, moment.end - moment.start),
        blobUrl: null,
        processing: false,
        isAiDetected: moment.isAiDetected,
        score: moment.score,
        reason: moment.reason,
        renderSignature: null,
        briefingNarrative: briefingMomentMeta.get(moment.start.toFixed(2))?.narrative,
        briefingFlags: briefingMomentMeta.get(moment.start.toFixed(2))?.flags,
      }));

      if (generated.length === 0) throw new Error("Tidak ada klip yang dapat dibuat");

      setClips(generated);
      setCampaignWorkspace((previous) => ({ ...normalizeWorkspace(previous), enabled: previous.enabled || effectiveBriefing.enabled, lastGeneratedAt: Date.now() }));
      setSelectedId(generated[0].id);
      if (briefing.enabled && briefing.requireLogo && (!branding.enabled || !branding.logoDataUrl)) {
        setProgress(100);
        setWarning("Draft klip sesuai briefing sudah dibuat. Briefing mewajibkan logo di semua video—upload logo di Branding sebelum render.");
        setStatus("Draft briefing siap. Lengkapi logo lalu render.");
      } else {
        setStatus(`Render preview pertama: ${generated[0].title}`);
        await processClip(generated[0], uploadedVideo, metadata, segmentsForRender, (percent, phase) => {
          setStatus(phase === "captions" ? "Membuat layer caption..." : `Render ${settings.crop} + caption ke MP4...`);
          const local = phase === "captions" ? percent * 0.2 : 20 + percent * 0.8;
          setProgress(82 + Math.round(local * 0.18));
        });
        setProgress(100);
        setStatus(briefing.enabled ? "Draft sesuai briefing siap. Review compliance setiap klip sebelum export." : "Selesai. Pilih klip, edit trim/caption, lalu render sesuai kebutuhan.");
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus("");
      setWarning(`Gagal memproses video: ${message}`);
    } finally {
      setBusy(false);
      window.setTimeout(() => setProgress(0), 900);
    }
  };

  const handleRenderClip = async (clip: Clip) => {
    setSelectedId(clip.id);
    if (!uploadedVideo || clip.processing || busy) return;

    let metadata = videoMeta;
    if (!metadata) {
      metadata = await getVideoMetadata(uploadedVideo);
      setVideoMeta(metadata);
    }

    setBusy(true);
    setProgress(0);
    setWarning("");
    setStatus(`Menyiapkan render: ${clip.title}`);
    const controller = new AbortController();
    renderControllersRef.current.set(clip.id, controller);

    try {
      await processClip(clip, uploadedVideo, metadata, transcriptSegments, (percent, phase) => {
        setStatus(phase === "captions" ? "Membuat layer caption..." : "Render video, smart crop, audio, dan caption...");
        setProgress(phase === "captions" ? Math.round(percent * 0.2) : 20 + Math.round(percent * 0.8));
      }, controller.signal);
      if (captionStyle !== "none" && getCuesForClip(clip).length === 0) {
        setWarning("Klip berhasil dirender, tetapi tidak ada caption bertimestamp. Kamu dapat menambah caption manual di editor.");
      }
      setStatus("Preview/export siap.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if ((error as Error)?.name === "AbortError") { setStatus("Render dibatalkan."); setWarning(""); }
      else setWarning(`Gagal membuat preview: ${message}`);
    } finally {
      renderControllersRef.current.delete(clip.id);
      setBusy(false);
      window.setTimeout(() => setProgress(0), 900);
    }
  };

  const handleRenderAll = async () => {
    if (!uploadedVideo || busy || clips.length === 0) return;
    let metadata = videoMeta;
    if (!metadata) {
      metadata = await getVideoMetadata(uploadedVideo);
      setVideoMeta(metadata);
    }
    const queue = clips.filter((clip) => !clip.blobUrl || clip.renderSignature !== getCurrentSignature(clip));
    if (queue.length === 0) {
      setStatus("Semua klip sudah menggunakan setting terbaru.");
      setProgress(100);
      window.setTimeout(() => setProgress(0), 1000);
      return;
    }

    setBusy(true);
    setWarning("");
    setProgress(0);
    batchCancelRef.current = false;
    let failed = 0;
    try {
      for (let index = 0; index < queue.length; index += 1) {
        if (batchCancelRef.current) break;
        const clip = queue[index];
        setSelectedId(clip.id);
        setStatus(`Batch render ${index + 1}/${queue.length}: ${clip.title}`);
        try {
          const controller = new AbortController();
          renderControllersRef.current.set(clip.id, controller);
          await processClip(clip, uploadedVideo, metadata, transcriptSegments, (percent, phase) => {
            const phaseProgress = phase === "captions" ? percent * 0.18 : 18 + percent * 0.82;
            setProgress(Math.round(((index + phaseProgress / 100) / queue.length) * 100));
          }, renderControllersRef.current.get(clip.id)?.signal);
        } catch (error) {
          if ((error as Error)?.name !== "AbortError") failed += 1;
          console.error("Batch render clip failed", clip.id, error);
        } finally {
          renderControllersRef.current.delete(clip.id);
        }
        setProgress(Math.round(((index + 1) / queue.length) * 100));
      }
      void trackAnalytics("batch_render_complete", { total: queue.length, failed, branding: branding.enabled, smartCrop: settings.smartCrop });
      if (failed > 0) {
        setWarning(`${queue.length - failed} klip berhasil dirender, ${failed} gagal. Klip gagal dapat dirender ulang satu per satu.`);
      }
      if (batchCancelRef.current) setStatus("Batch render dibatalkan.");
      else setStatus(failed === 0 ? `Batch render selesai: ${queue.length} klip siap.` : "Batch render selesai dengan beberapa kegagalan.");
    } finally {
      setBusy(false);
      window.setTimeout(() => setProgress(0), 1200);
    }
  };

  const handleDownloadAll = () => {
    const ready = clips.filter((clip) => clip.blobUrl && clip.renderSignature === getCurrentSignature(clip));
    if (ready.length === 0) return;
    const ratioName = outputInfo?.ratio || settings.crop;
    ready.forEach((clip, index) => {
      window.setTimeout(() => {
        if (!clip.blobUrl) return;
        const anchor = document.createElement("a");
        anchor.href = clip.blobUrl;
        anchor.download = `ai-clip-${clip.id}-${ratioName}-${captionStyle}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }, index * 250);
    });
    setStatus(`Meminta browser mengunduh ${ready.length} klip siap. Browser mungkin meminta izin multiple downloads.`);
  };

  const handleTrimChange = (start: number, end: number) => {
    if (!selectedClip || !videoMeta) return;
    const safeStart = Math.max(0, Math.min(start, videoMeta.duration - 1));
    const safeEnd = Math.max(safeStart + 1, Math.min(end, videoMeta.duration));
    setClips((previous) => previous.map((clip) => clip.id === selectedClip.id
      ? { ...clip, start: safeStart, duration: safeEnd - safeStart }
      : clip));
    setCaptionOverrides((previous) => {
      const next = { ...previous };
      delete next[selectedClip.id];
      return next;
    });
    setFaceFocuses((previous) => {
      const next = { ...previous };
      delete next[selectedClip.id];
      return next;
    });
    setFaceTracks((previous) => {
      const next = { ...previous };
      delete next[selectedClip.id];
      return next;
    });
    setStatus("Trim diperbarui. Caption dan smart framing akan dihitung ulang saat render.");
  };

  const selectedCues = selectedClip ? getCuesForClip(selectedClip) : [];

  const setSelectedCues = (nextCues: CaptionCue[]) => {
    if (!selectedClip) return;
    setCaptionOverrides((previous) => ({ ...previous, [selectedClip.id]: nextCues }));
  };

  const handleCueTextChange = (index: number, text: string) => {
    const next = selectedCues.map((cue, cueIndex) => cueIndex === index ? { ...cue, text } : cue);
    setSelectedCues(next);
  };

  const handleCueDelete = (index: number) => {
    setSelectedCues(selectedCues.filter((_, cueIndex) => cueIndex !== index));
  };

  const handleCueAdd = () => {
    if (!selectedClip) return;
    const lastEnd = selectedCues.length > 0 ? selectedCues[selectedCues.length - 1].end : 0;
    let start = Math.min(Math.max(0, lastEnd), Math.max(0, selectedClip.duration - 0.5));
    let end = Math.min(selectedClip.duration, start + 2.5);
    if (end - start < 0.4) {
      start = Math.max(0, selectedClip.duration - 2);
      end = selectedClip.duration;
    }
    setSelectedCues([...selectedCues, { start, end, text: "Tulis caption di sini" }]);
  };

  const handleResetCaptions = () => {
    if (!selectedClip) return;
    setCaptionOverrides((previous) => {
      const next = { ...previous };
      delete next[selectedClip.id];
      return next;
    });
  };

  const handleCaptionStyleChange = (style: CaptionStyle) => {
    setSocialTemplateId(null);
    setCaptionStyle(style);
    setCaptionOverrides({});
  };

  const handleSettingsChange = (next: ClipperSettings) => {
    const smartChanged = next.smartCrop !== settings.smartCrop;
    setSocialTemplateId(null);
    setSettings(next);
    if (smartChanged) {
      setFaceFocuses({});
      setFaceTracks({});
    }
  };

  const handleApplyTemplate = (template: SocialTemplate) => {
    const nextSettings = { ...settings, ...template.settings };
    const smartChanged = nextSettings.smartCrop !== settings.smartCrop;
    setSocialTemplateId(template.id);
    setSettings(nextSettings);
    setCaptionStyle(template.captionStyle);
    setCaptionOverrides({});
    setBranding((previous) => normalizeBranding({ ...previous, ...template.branding }));
    if (smartChanged) { setFaceFocuses({}); setFaceTracks({}); }
    setStatus(`Template ${template.name} diterapkan. Semua parameter masih bisa diedit manual.`);
  };

  const handleBrandingChange = (next: BrandingSettings) => {
    setSocialTemplateId(null);
    setBranding(next);
  };

  const handleApplyBriefingRecommendations = (next: BriefingSpec) => {
    setBriefing(next);
    setCampaignWorkspace((previous) => ({
      ...normalizeWorkspace(previous),
      enabled: true,
      focusedNarrative: null,
    }));
    setSettings((current) => ({
      ...current,
      aiMode: "transcript",
      speakerMode: next.requireTargetSpeaker ? "diarize" : current.speakerMode,
      previewCount: Math.max(current.previewCount, Math.min(12, Math.max(3, next.requiredNarratives.length || current.previewCount))),
    }));
    if (next.requireLogo) setBranding((current) => ({ ...current, enabled: true }));
    setStatus("Briefing diterapkan: AI + Timestamp aktif, diarization mengikuti kebutuhan target speaker, dan aturan campaign akan dipakai saat memilih klip.");
  };

  const handleFocusNarrative = (narrative: string | null) => {
    setCampaignWorkspace((previous) => ({
      ...normalizeWorkspace(previous),
      enabled: true,
      focusedNarrative: narrative,
    }));
    setStatus(narrative
      ? `Campaign Workspace fokus ke narasi: ${narrative}. Klik Cari Preview Klip untuk membuat kandidat yang lebih spesifik.`
      : "Campaign Workspace kembali ke mode semua narasi. Klik Cari Preview Klip untuk menyusun coverage campaign lengkap.");
  };

  const handleDownload = (clip: Clip) => {
    if (!clip.blobUrl) return;
    const ratioName = outputInfo?.ratio || settings.crop;
    const anchor = document.createElement("a");
    anchor.href = clip.blobUrl;
    anchor.download = `ai-clip-${clip.id}-${ratioName}-${captionStyle}-${Date.now()}.mp4`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleNewProject = () => {
    resetClips();
    setUploadedVideo(null);
    setVideoMeta(null);
    setTranscriptSegments([]);
    setCaptionOverrides({});
    setFaceFocuses({});
    setFaceTracks({});
    setClipMetadata({});
    setSocialTemplateId(null);
    setBriefing({ ...EMPTY_BRIEFING });
    setCampaignWorkspace({ ...EMPTY_WORKSPACE });
    setWarning("");
    setStatus("");
    setProgress(0);
    setProjectId(null);
    setProjectName("");
    setSaveState("idle");
    setCloudState("idle");
  };

  const handleOpenProject = async (id: string) => {
    setBusy(true);
    setWarning("");
    setStatus("Membuka project lokal...");
    try {
      const loaded = await loadProject(id);
      if (!loaded) throw new Error("Project tidak ditemukan.");
      resetClips();
      const draft = loaded.draft;
      setProjectId(draft.id);
      setProjectName(draft.name);
      setProjectCreatedAt(draft.createdAt);
      setUploadedVideo(loaded.sourceFile);
      setVideoMeta(draft.videoMeta);
      setCaptionStyle(draft.captionStyle);
      setTranscriptSegments(draft.transcriptSegments || []);
      setCaptionOverrides(draft.captionOverrides || {});
      setFaceFocuses(draft.faceFocuses || {});
      setFaceTracks(draft.faceTracks || {});
      if (draft.branding) setBranding(normalizeBranding(draft.branding));
      setSocialTemplateId(draft.socialTemplateId || null);
      setClipMetadata(draft.clipMetadata || {});
      setBriefing(normalizeBriefing(draft.briefing || EMPTY_BRIEFING));
      setCampaignWorkspace(normalizeWorkspace(draft.campaignWorkspace || EMPTY_WORKSPACE));
      setSettings({
        ...draft.settings,
        smartCrop: draft.settings?.smartCrop || "dynamic",
        speakerMode: draft.settings?.speakerMode || "off",
        renderMode: draft.settings?.renderMode || "auto",
      });
      setClips((draft.clips || []).map((clip) => ({ ...clip, blobUrl: null, processing: false, renderSignature: null })));
      setSelectedId(draft.selectedId);
      setSaveState("saved");
      if (!loaded.sourceFile) {
        setWarning("Draft berhasil dibuka, tetapi video sumber tidak disimpan karena ukurannya besar. Pilih ulang file sumber sebelum render.");
      } else {
        setStatus("Project dipulihkan. Preview hasil render perlu dibuat ulang.");
      }
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Gagal membuka project.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!projectId || !uploadedVideo) return;
    const timer = window.setTimeout(() => {
      const sourceStored = canPersistSource(uploadedVideo);
      const draft: ProjectDraft = {
        id: projectId,
        name: projectName || uploadedVideo.name,
        createdAt: projectCreatedAt,
        updatedAt: Date.now(),
        sourceName: uploadedVideo.name,
        sourceType: uploadedVideo.type,
        sourceSize: uploadedVideo.size,
        sourceLastModified: uploadedVideo.lastModified,
        sourceStored,
        videoMeta,
        captionStyle,
        transcriptSegments,
        captionOverrides,
        faceFocuses,
        faceTracks,
        branding,
        socialTemplateId,
        clipMetadata,
        briefing,
        campaignWorkspace,
        settings,
        clips: clips.map((clip) => ({ id: clip.id, title: clip.title, start: clip.start, duration: clip.duration, isAiDetected: clip.isAiDetected, score: clip.score, reason: clip.reason, briefingNarrative: clip.briefingNarrative, briefingFlags: clip.briefingFlags })),
        selectedId,
      };
      setSaveState("saving");
      void saveProject(draft, uploadedVideo).then(async () => {
        setSaveState("saved");
        notifyProjectsChanged();
        if (authUser?.emailVerified) {
          setCloudState("syncing");
          try {
            await syncProjectToCloud(draft);
            setCloudState("synced");
            void trackAnalytics("cloud_sync_success", { clipCount: draft.clips.length, sourceMb: Math.round(draft.sourceSize / 1024 / 1024) });
          } catch (error) {
            const code = (error as Error & { code?: string }).code;
            setCloudState(code === "PROJECT_CONFLICT" ? "conflict" : "error");
            void trackAnalytics("cloud_sync_error", { code: code || "UNKNOWN" });
          }
        } else {
          setCloudState("idle");
        }
      }).catch((error) => {
        console.error("Autosave project failed", error);
        setSaveState("error");
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [projectId, projectName, projectCreatedAt, uploadedVideo, videoMeta, captionStyle, transcriptSegments, captionOverrides, faceFocuses, faceTracks, branding, socialTemplateId, clipMetadata, briefing, campaignWorkspace, settings, clips, selectedId, authUser?.uid, authUser?.emailVerified]);

  const canProcess = activeTab === "upload" && Boolean(uploadedVideo) && !busy;
  const selectedIsStale = Boolean(selectedClip?.blobUrl && selectedClip.renderSignature !== getCurrentSignature(selectedClip));
  const selectedIsFresh = Boolean(selectedClip?.blobUrl && !selectedIsStale);
  const selectedFace = selectedClip ? faceFocuses[selectedClip.id] : undefined;
  const selectedTrack = selectedClip ? faceTracks[selectedClip.id] : undefined;
  const freshClips = clips.filter((clip) => Boolean(clip.blobUrl && clip.renderSignature === getCurrentSignature(clip)));
  const selectedCompliance = selectedClip && briefing.enabled ? evaluateBriefCompliance({
    brief: briefing,
    start: selectedClip.start,
    duration: selectedClip.duration,
    transcript: transcriptForRange(transcriptSegments, selectedClip.start, selectedClip.duration),
    segments: transcriptSegments,
    branding,
    hashtags: clipMetadata[selectedClip.id]?.hashtags,
  }) : [];

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 sticky top-0 z-30 bg-black/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl hidden sm:inline">AI Clipper</span>
          <span className="bg-emerald-500/15 text-emerald-400 text-xs px-2 py-1 rounded-full">STAGE 11</span>
          <div className="ml-auto flex items-center gap-2">
            <PwaInstallButton />
            <a href="/pricing" className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-sm flex items-center gap-2"><CreditCard className="w-4 h-4" /><span className="hidden sm:inline">Harga</span></a>
            {projectId && (
              <span className={`hidden md:flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${saveState === "error" ? "text-red-300 bg-red-500/10" : "text-zinc-400 bg-zinc-900"}`}>
                {saveState === "saving" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saveState === "saving" ? "Menyimpan..." : saveState === "error" ? "Autosave gagal" : "Tersimpan lokal"}
              </span>
            )}
            {projectId && authUser?.emailVerified && (
              <span className={`hidden md:flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${cloudState === "error" || cloudState === "conflict" ? "text-amber-300 bg-amber-500/10" : "text-sky-300 bg-sky-500/10"}`}>
                {cloudState === "syncing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                {cloudState === "syncing" ? "Cloud sync..." : cloudState === "synced" ? "Cloud synced" : cloudState === "conflict" ? "Cloud lebih baru" : cloudState === "error" ? "Cloud gagal" : "Cloud siap"}
              </span>
            )}
            <button type="button" onClick={() => setHistoryOpen(true)} className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-sm flex items-center gap-2"><FolderOpen className="w-4 h-4" /><span className="hidden sm:inline">Project</span></button>
            <button type="button" onClick={() => setAccountOpen(true)} className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-sm flex items-center gap-2"><UserRound className="w-4 h-4" /><span className="hidden sm:inline">Akun</span></button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm">Clipping & smart framing lokal • AI menerima audio terkompresi</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Ubah video panjang jadi <span className="text-emerald-500">klip siap upload</span>
          </h1>
          <p className="text-zinc-400 text-lg">AI membaca briefing campaign, memilih section yang sesuai narasi dan aturan, mengenali speaker, menambahkan CTA/branding, lalu kamu bisa review compliance sebelum render dan export.</p>
        </div>

        <BriefingPanel value={briefing} speakerCount={speakerCount} disabled={busy} onChange={setBriefing} onApplyRecommendations={handleApplyBriefingRecommendations} />
        <CampaignWorkspace
          brief={briefing}
          workspace={campaignWorkspace}
          clips={clips}
          branding={branding}
          clipMetadata={clipMetadata}
          disabled={busy}
          onChange={setCampaignWorkspace}
          onFocusNarrative={handleFocusNarrative}
          onSelectClip={setSelectedId}
        />

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
          {projectId && (
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-zinc-500 block mb-1">NAMA PROJECT</label>
                <input value={projectName} onChange={(event) => setProjectName(event.target.value.slice(0, 80))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-medium" />
              </div>
              <div className="text-xs text-zinc-500 sm:text-right">Autosave IndexedDB + Cloud Draft<br />{uploadedVideo && canPersistSource(uploadedVideo) ? "Video sumber ikut disimpan lokal" : "Video >300 MB: metadata saja"}</div>
            </div>
          )}
          <div className="flex gap-2 mb-6">
            <button type="button" onClick={() => setActiveTab("youtube")} className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === "youtube" ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
              <Play className="w-5 h-5" /> YouTube Link <span className="text-[10px] opacity-70">BETA</span>
            </button>
            <button type="button" onClick={() => setActiveTab("upload")} className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === "upload" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
              <Upload className="w-5 h-5" /> Upload Video
            </button>
          </div>

          {activeTab === "youtube" ? (
            <YouTubeInput value={videoUrl} onChange={setVideoUrl} onUseUpload={() => setActiveTab("upload")} />
          ) : (
            <VideoUploader onUpload={handleUpload} video={uploadedVideo} />
          )}

          <div className="mt-8">
            <label className="text-sm text-zinc-400 mb-3 block">GAYA CAPTION</label>
            <CaptionStyleSelector value={captionStyle} onChange={handleCaptionStyleChange} available={settings.aiMode === "transcript"} />
          </div>

          <button
            type="button"
            onClick={handleFindPreviews}
            disabled={!canProcess}
            className="w-full mt-8 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {busy ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> {status || "Memproses..."}</>
            ) : activeTab === "youtube" ? (
              <><Upload className="w-5 h-5" /> Gunakan Upload Video untuk Memproses</>
            ) : !uploadedVideo ? (
              <><Upload className="w-5 h-5" /> Pilih video terlebih dahulu</>
            ) : (
              <><Brain className="w-5 h-5" /> {briefing.enabled ? "Cari Klip Sesuai Briefing" : "Cari Momen & Buat Draft Klip"}</>
            )}
          </button>

          {(busy || progress > 0) && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-2"><span>{status || "Memproses..."}</span><span>{progress}%</span></div>
              <div className="bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {warning && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          )}

          <p className="text-center text-zinc-600 text-sm mt-4">Mode Auto merender lokal untuk video normal dan dapat memakai external FFmpeg worker untuk video besar. AI tetap hanya menerima audio terkompresi.</p>
        </div>

        {clips.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2"><Scissors className="w-5 h-5 text-emerald-500" /> Draft Klip ({clips.length})</h3>
                <div className="flex flex-wrap gap-2 text-[11px] mt-2">
                  {outputInfo && <span className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1">{outputInfo.ratio} • {outputInfo.width}×{outputInfo.height}</span>}
                  <span className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 flex items-center gap-1"><Captions className="w-3 h-3" /> {captionStyle}</span>
                  {speakerCount > 0 && <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-full px-3 py-1">{speakerCount} speaker</span>}
                  <span className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1">Render: {settings.renderMode}</span>
                  <span className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 flex items-center gap-1"><ScanFace className="w-3 h-3" /> {settings.smartCrop === "dynamic" ? "Active Subject Beta" : settings.smartCrop === "face" ? "Smart Face" : "Center"}</span>
                  {branding.enabled && <span className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Branding aktif</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !uploadedVideo} onClick={() => void handleRenderAll()} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Render Semua
                </button>
                <button type="button" disabled={busy || freshClips.length === 0} onClick={handleDownloadAll} className="bg-zinc-800 hover:bg-zinc-700 disabled:text-zinc-600 px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download Siap ({freshClips.length})
                </button>
              </div>
            </div>

            <ExportPanel
              clips={freshClips.filter((clip): clip is Clip & { blobUrl: string } => Boolean(clip.blobUrl)).map((clip) => ({ id: clip.id, title: clip.title, blobUrl: clip.blobUrl, cues: getCuesForClip(clip) }))}
              projectName={projectName || "AI-Clips"}
              ratio={outputInfo?.ratio || settings.crop}
              captionStyle={captionStyle}
              disabled={busy}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 mt-5">
              {clips.map((clip) => {
                const currentSignature = getCurrentSignature(clip);
                const isFresh = clip.blobUrl && clip.renderSignature === currentSignature;
                const isStale = clip.blobUrl && !isFresh;
                return (
                  <button
                    key={clip.id}
                    type="button"
                    disabled={busy && selectedId !== clip.id}
                    onClick={() => setSelectedId(clip.id)}
                    className={`text-left p-4 rounded-lg border transition-all disabled:opacity-50 ${selectedId === clip.id ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"}`}
                  >
                    <div className="font-semibold text-sm mb-1 line-clamp-2">{clip.title}</div>
                    <div className="text-xs text-zinc-400">{fmt(clip.start)} – {fmt(clip.start + clip.duration)} • {clip.duration.toFixed(1)} dtk</div>
                    {clip.reason && <div className="text-[11px] text-zinc-500 mt-2 line-clamp-2">{clip.reason}</div>}
                    {clip.briefingNarrative && <div className="text-[10px] text-violet-300 mt-2 line-clamp-2">Brief: {clip.briefingNarrative}</div>}
                    {clip.briefingFlags?.length ? <div className="text-[10px] text-amber-300 mt-1 line-clamp-2">⚠ {clip.briefingFlags.join(" • ")}</div> : null}
                    <div className="text-xs mt-3 flex items-center gap-2">
                      {clip.processing ? (
                        <span className="text-emerald-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Render...</span>
                      ) : isFresh ? (
                        <span className="text-emerald-400">✓ Export siap</span>
                      ) : isStale ? (
                        <span className="text-amber-300">↻ Perlu render ulang</span>
                      ) : (
                        <span className="text-zinc-500">Pilih untuk edit</span>
                      )}
                    </div>
                    {clip.isAiDetected && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full"><Sparkles className="w-3 h-3" /> {briefing.enabled ? "Brief AI" : "Timestamp AI"} • skor {clip.score.toFixed(1)}</div>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedClip && (
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="font-semibold">{selectedClip.title}</div>
                    <div className="text-xs text-zinc-500 mt-1">Edit draft terlebih dahulu, kemudian render hanya saat diperlukan.</div>
                  </div>
                  {settings.smartCrop === "dynamic" && selectedTrack ? (
                    <span className={`text-xs px-3 py-1.5 rounded-full border ${selectedTrack.mode === "face" ? "text-emerald-300 border-emerald-500/20 bg-emerald-500/10" : "text-zinc-400 border-zinc-700 bg-zinc-800"}`}>
                      {selectedTrack.mode === "face" ? `Active Subject • ${selectedTrack.points.length} titik` : "Active Subject → Center fallback"}
                    </span>
                  ) : settings.smartCrop === "face" && selectedFace ? (
                    <span className={`text-xs px-3 py-1.5 rounded-full border ${selectedFace.mode === "face" ? "text-emerald-300 border-emerald-500/20 bg-emerald-500/10" : "text-zinc-400 border-zinc-700 bg-zinc-800"}`}>
                      {selectedFace.mode === "face" ? `Smart Face ${selectedFace.detectedSamples}/${selectedFace.totalSamples} sampel` : "Smart Face → Center fallback"}
                    </span>
                  ) : null}
                </div>

                {selectedClip.blobUrl ? (
                  <>
                    {selectedIsStale && (
                      <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                        Preview di bawah masih memakai trim/caption/framing sebelumnya. Editor tetap dapat digunakan lalu render ulang sekali saja.
                      </div>
                    )}
                    <video src={selectedClip.blobUrl} controls playsInline className="w-auto max-w-full mx-auto rounded-lg bg-black max-h-[620px]" />
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-700 bg-black/30 py-12 text-center text-zinc-500 text-sm">
                    Klip ini belum dirender. Atur trim dan caption di bawah terlebih dahulu.
                  </div>
                )}

                <ClipEditor
                  clipStart={selectedClip.start}
                  clipDuration={selectedClip.duration}
                  videoDuration={videoMeta?.duration || selectedClip.start + selectedClip.duration}
                  captionStyle={captionStyle}
                  cues={selectedCues}
                  sourceFile={uploadedVideo}
                  transcriptSegments={transcriptSegments}
                  disabled={busy}
                  onTrimChange={handleTrimChange}
                  onCueTextChange={handleCueTextChange}
                  onCueDelete={handleCueDelete}
                  onCueAdd={handleCueAdd}
                  onResetCaptions={handleResetCaptions}
                />

                <BriefCompliancePanel checks={selectedCompliance} />

                <ClipPublishPanel
                  clipTitle={selectedClip.title}
                  reason={selectedClip.reason}
                  transcript={selectedCues.map((cue) => cue.text).join(" ")}
                  vibe={settings.vibe}
                  durationSec={selectedClip.duration}
                  value={clipMetadata[selectedClip.id]}
                  briefing={briefing}
                  disabled={busy}
                  onChange={(value) => setClipMetadata((previous) => ({ ...previous, [selectedClip.id]: value }))}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <button type="button" disabled={busy} onClick={() => handleRenderClip(selectedClip)} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                    {busy && selectedClip.processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    {selectedIsFresh ? "Render ulang" : selectedClip.blobUrl ? "Render perubahan" : "Render klip"}
                  </button>
                  <button type="button" disabled={!selectedIsFresh} onClick={() => handleDownload(selectedClip)} className="bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                    <Download className="w-5 h-5" /> {selectedIsFresh ? `Download ${selectedClip.title}` : "Render dulu untuk download"}
                  </button>
                  <button type="button" disabled={!selectedClip.processing} onClick={() => { batchCancelRef.current = true; renderControllersRef.current.get(selectedClip.id)?.abort(); }} className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:border-zinc-800 text-red-300 font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                    <Square className="w-4 h-4 fill-current" /> Batalkan Render
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <SocialTemplateSelector selected={socialTemplateId} disabled={busy} onApply={handleApplyTemplate} />
        <SettingsPanel settings={settings} onChange={handleSettingsChange} />
        <BrandingPanel value={branding} onChange={handleBrandingChange} disabled={busy} />
      </main>

      <ProjectHistory
        open={historyOpen}
        currentProjectId={projectId}
        onClose={() => setHistoryOpen(false)}
        onOpenProject={handleOpenProject}
        onNewProject={handleNewProject}
      />
      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} onAuthChanged={setAuthUser} />
    </div>
  );
}
