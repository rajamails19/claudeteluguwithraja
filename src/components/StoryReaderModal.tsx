import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, X } from "lucide-react";
import type { Story } from "@/data/stories";
import { ProgressDots } from "./ProgressDots";
import { getCachedAudio, putCachedAudio } from "@/lib/ttsCache";
import { StoryCelebration } from "./StoryCelebration";

interface Props {
  story: Story | null;
  onClose: () => void;
}

export function StoryReaderModal({ story, onClose }: Props) {
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const touchStart = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">(
    "idle",
  );
  const [audioError, setAudioError] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState<"off" | "playing" | "paused">("off");
  const autoPlayRef = useRef<"off" | "playing" | "paused">("off");
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Word highlight state
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const highlightRafRef = useRef<number | null>(null);
  const highlightWordsRef = useRef<string[]>([]);

  // Celebration state
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const clearHighlight = useCallback(() => {
    if (highlightRafRef.current !== null) {
      cancelAnimationFrame(highlightRafRef.current);
      highlightRafRef.current = null;
    }
    setActiveWordIndex(-1);
  }, []);

  // Reset page when story changes
  useEffect(() => {
    setPage(0);
    setDir(1);
    setAutoPlay("off");
    setShowCelebration(false);
    clearAdvanceTimer();
  }, [story?.id, clearAdvanceTimer]);

  const total = story?.pages.length ?? 0;

  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
      a.onended = null;
      a.onerror = null;
    }
    setAudioState("idle");
    clearHighlight();
  }, [clearHighlight]);

  const next = useCallback(() => {
    stopAudio();
    setDir(1);
    setPage((p) => Math.min(p + 1, total - 1));
  }, [total, stopAudio]);

  const prev = useCallback(() => {
    stopAudio();
    setDir(-1);
    setPage((p) => Math.max(p - 1, 0));
  }, [stopAudio]);

  // Stop audio whenever the page changes (covers swipe/keyboard too)
  useEffect(() => {
    if (autoPlayRef.current !== "playing") {
      stopAudio();
    }
    setAudioError(null);
  }, [page, stopAudio]);

  // Cleanup audio + blob URLs on unmount / story change
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      cacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      cacheRef.current.clear();
      clearAdvanceTimer();
      clearHighlight();
    };
  }, [story?.id, clearAdvanceTimer, clearHighlight]);

  // Keyboard nav + lock scroll
  useEffect(() => {
    if (!story) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [story, next, prev, onClose]);

  const startWordHighlight = useCallback((audio: HTMLAudioElement, text: string) => {
    const words = text.split(/\s+/).filter(Boolean);
    highlightWordsRef.current = words;
    if (words.length === 0) return;

    const totalChars = words.reduce((s, w) => s + w.length, 0);
    // cumulative char counts (end of each word)
    const cumChars: number[] = [];
    let acc = 0;
    for (const w of words) {
      acc += w.length;
      cumChars.push(acc);
    }

    const tick = () => {
      if (!audio || audio.paused || audio.ended) {
        setActiveWordIndex(-1);
        return;
      }
      const dur = audio.duration;
      if (dur && dur > 0) {
        const progress = audio.currentTime / dur;
        let idx = words.length - 1;
        for (let i = 0; i < cumChars.length; i++) {
          if (progress <= cumChars[i] / totalChars) {
            idx = i;
            break;
          }
        }
        setActiveWordIndex(idx);
      }
      highlightRafRef.current = requestAnimationFrame(tick);
    };
    highlightRafRef.current = requestAnimationFrame(tick);
  }, []);

  const playText = useCallback(
    async (text: string, onEnded?: () => void) => {
      setAudioError(null);
      try {
        let url = cacheRef.current.get(text);
        if (!url) {
          setAudioState("loading");
          let blob = await getCachedAudio(text);
          if (!blob) {
            const res = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text }),
            });
            if (!res.ok) throw new Error(`TTS failed (${res.status})`);
            blob = await res.blob();
            await putCachedAudio(text, blob);
          }
          url = URL.createObjectURL(blob);
          cacheRef.current.set(text, url);
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setAudioState("idle");
          clearHighlight();
          onEnded?.();
        };
        audio.onerror = () => {
          setAudioState("idle");
          clearHighlight();
          setAudioError("Couldn't play audio.");
        };
        await audio.play();
        setAudioState("playing");
        startWordHighlight(audio, text);
      } catch (err) {
        console.error(err);
        setAudioState("idle");
        clearHighlight();
        setAudioError("Couldn't load audio. Try again.");
      }
    },
    [startWordHighlight, clearHighlight],
  );

  if (!story) return null;
  const current = story.pages[page];

  const playTelugu = async () => {
    if (audioState === "playing") {
      stopAudio();
      return;
    }
    await playText(current.telugu);
  };

  // Word tap — only when audio is idle
  const handleWordTap = (word: string) => {
    if (audioState !== "idle") return;
    void playText(word);
  };

  // Render Telugu text as tappable word spans
  const renderTeluguWords = (text: string, isCurrentPage: boolean) => {
    const words = text.split(/\s+/).filter(Boolean);
    return (
      <p className="font-telugu text-2xl leading-snug text-foreground sm:text-[32px]">
        {words.map((word, i) => {
          const isActive = isCurrentPage && activeWordIndex === i;
          return (
            <span key={i}>
              <span
                onClick={() => isCurrentPage && handleWordTap(word)}
                className="cursor-pointer rounded-md px-0.5 transition-all duration-150"
                style={
                  isActive
                    ? {
                        background: "oklch(0.88 0.12 80 / 0.85)",
                        color: "oklch(0.22 0.06 60)",
                        borderRadius: "6px",
                        padding: "0 4px",
                      }
                    : {
                        borderRadius: "6px",
                        padding: "0 4px",
                      }
                }
              >
                {word}
              </span>
              {i < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    );
  };

  const renderPage = (p: { telugu: string; english: string; image: string }, withButton: boolean, isCurrentPage = false) => (
    <div className="flex h-full w-full max-w-6xl flex-col items-center">
      <div className="relative w-full flex-1 overflow-hidden rounded-2xl bg-paper shadow-book">
        <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="mt-5 max-w-3xl text-center sm:mt-7">
        <div className="flex items-center justify-center gap-3">
          {renderTeluguWords(p.telugu, isCurrentPage)}
          {withButton && (
            <button
              type="button"
              onClick={playTelugu}
              disabled={audioState === "loading"}
              aria-label={
                audioState === "playing" ? "Stop Telugu audio" : "Play Telugu audio"
              }
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition-all hover:enabled:brightness-110 disabled:opacity-60"
            >
              {audioState === "loading" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : audioState === "playing" ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 translate-x-[1px]" />
              )}
            </button>
          )}
        </div>
        <p className="mt-2 font-display text-base italic text-muted-foreground sm:text-lg">
          {p.english}
        </p>
        {withButton && audioError && (
          <p className="mt-2 text-xs text-destructive">{audioError}</p>
        )}
      </div>
    </div>
  );

  const playAutoForPage = (pageIndex: number) => {
    const text = story.pages[pageIndex].telugu;
    void playText(text, () => {
      if (autoPlayRef.current !== "playing") return;
      clearAdvanceTimer();
      const isLast = pageIndex >= total - 1;
      if (isLast) {
        advanceTimerRef.current = setTimeout(() => {
          setAutoPlay("off");
          autoPlayRef.current = "off";
          setShowCelebration(true);
        }, 800);
        return;
      }
      advanceTimerRef.current = setTimeout(() => {
        if (autoPlayRef.current !== "playing") return;
        const nextIndex = pageIndex + 1;
        setDir(1);
        setPage(nextIndex);
        playAutoForPage(nextIndex);
      }, 1000);
    });
  };

  const handleAutoPlay = () => {
    if (autoPlay === "playing") {
      setAutoPlay("paused");
      autoPlayRef.current = "paused";
      clearAdvanceTimer();
      stopAudio();
    } else {
      setAutoPlay("playing");
      autoPlayRef.current = "playing";
      stopAudio();
      playAutoForPage(page);
    }
  };

  const handleTheEnd = () => {
    stopAudio();
    setShowCelebration(true);
  };

  const handleReadAgain = () => {
    setShowCelebration(false);
    setPage(0);
    setDir(-1);
    setAutoPlay("off");
    autoPlayRef.current = "off";
    clearAdvanceTimer();
    stopAudio();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchStart.current = null;
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 bg-[oklch(0.18_0.02_60_/_0.72)] backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex flex-col bg-cream"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between gap-4 border-b border-border/60 bg-paper/80 px-4 py-3 backdrop-blur-sm sm:px-8">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {story.category}
              </p>
              <h2 className="truncate font-display text-lg leading-tight sm:text-xl">
                {story.title}
              </h2>
            </div>
            <div className="hidden sm:block">
              <ProgressDots total={total} current={page} />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleAutoPlay}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-soft transition-all hover:brightness-110 sm:px-4 sm:text-sm"
                aria-label={
                  autoPlay === "playing"
                    ? "Pause reading"
                    : autoPlay === "paused"
                      ? "Resume reading"
                      : "Read to me"
                }
              >
                {autoPlay === "playing" ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 translate-x-[1px]" />
                    <span>{autoPlay === "paused" ? "Resume" : "Read to me"}</span>
                  </>
                )}
              </button>
              <button
              type="button"
              onClick={onClose}
              aria-label="Close story"
              className="grid h-10 w-10 place-items-center rounded-full bg-foreground/5 text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            </div>
          </div>

          {/* Page */}
          <div className="relative flex flex-1 flex-col overflow-hidden">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-3 pt-4 pb-2 sm:px-10 sm:pt-8">
              <div className="relative h-full w-full flex items-center justify-center">
                {renderPage(current, true, true)}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between gap-3 px-4 pb-5 pt-2 sm:px-10 sm:pb-7">
              <button
                type="button"
                onClick={prev}
                disabled={page === 0}
                className="group inline-flex items-center gap-2 rounded-full border border-border bg-paper px-4 py-2.5 text-sm font-medium text-foreground/80 shadow-soft transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-foreground/5"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:enabled:-translate-x-0.5" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <div className="sm:hidden">
                <ProgressDots total={total} current={page} />
              </div>

              <button
                type="button"
                onClick={page >= total - 1 ? handleTheEnd : next}
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition-all hover:brightness-110"
                aria-label={page >= total - 1 ? "Finish story" : "Next page"}
              >
                <span>{page >= total - 1 ? "The End ✨" : "Next"}</span>
                {page < total - 1 && (
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
            </div>

            {/* Celebration overlay */}
            {showCelebration && (
              <StoryCelebration
                storyTitle={story.title}
                totalPages={total}
                onReadAgain={handleReadAgain}
                onClose={onClose}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
