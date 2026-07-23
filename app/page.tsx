const handleFindPreviews = async () => {
  if (!uploadedVideo) {
    alert("Silakan upload video terlebih dahulu");
    return;
  }
  setBusy(true);
  setClips([]);
  setSelectedId(null);
  setProgress(0);

  try {
    setStatus("Membaca durasi video...");
    const duration = await getVideoDuration(uploadedVideo);
    if (!duration || duration <= 0) throw new Error("Durasi video tidak valid");

    console.log("[App] Video duration:", duration);

    let viralMoments: ViralMoment[] = [];

    if (settings.aiMode === "transcript") {
      setStatus("Mentranskripsi audio dengan AI (Groq)...");
      try {
        const formData = new FormData();
        formData.append("file", uploadedVideo);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Transkripsi gagal");
        }

        const data = await res.json();
        console.log("[App] Transcription result:", {
          length: data.transcript?.length,
          preview: data.transcript?.substring(0, 100)
        });

        setStatus("Mendeteksi momen viral dari transkripsi...");
        viralMoments = detectViralMoments(data.transcript, duration, settings.previewCount);
        
        console.log("[App] Viral moments detected:", viralMoments.length);
      } catch (aiError) {
        console.warn("[App] AI Transcription failed:", aiError);
        setStatus("AI gagal, menggunakan pembagian video otomatis...");
        const clipLen = Math.min(30, duration / settings.previewCount);
        viralMoments = Array.from({ length: settings.previewCount }, (_, i) => ({
          start: i * clipLen,
          end: Math.min(duration, (i + 1) * clipLen),
          score: 0.5,
          title: `Bagian ${i + 1}`,
          isAiDetected: false
        }));
      }
    } else {
      setStatus("Membagi video secara otomatis...");
      const clipLen = Math.min(30, duration / settings.previewCount);
      viralMoments = Array.from({ length: settings.previewCount }, (_, i) => ({
        start: i * clipLen,
        end: Math.min(duration, (i + 1) * clipLen),
        score: 0.5,
        title: `Bagian ${i + 1}`,
        isAiDetected: false
      }));
    }

    const generated: Clip[] = viralMoments.map((moment, i) => ({
      id: i + 1,
      title: moment.title.length > 40 ? moment.title.substring(0, 40) + "..." : moment.title,
      start: moment.start,
      duration: moment.end - moment.start,
      blobUrl: null,
      processing: false,
      isAiDetected: moment.isAiDetected || false,
    }));

    console.log("[App] Generated clips:", generated);
    setClips(generated);

    // Auto-proses klip pertama
    setStatus(`Memproses ${generated[0].title}...`);
    await processClip(generated[0], uploadedVideo);
    setSelectedId(generated[0].id);
    setStatus("Selesai! Klik klip lain untuk memprosesnya.");
  } catch (error) {
    console.error("[App] Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    setStatus("");
    alert(`Gagal memproses: ${msg}`);
  } finally {
    setBusy(false);
    setProgress(0);
  }
};
