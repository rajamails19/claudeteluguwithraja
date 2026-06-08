import { motion, AnimatePresence } from "motion/react";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  storyTitle: string;
  totalPages: number;
  onDone: () => void; // auto-called after 3s → resets to page 1
}

function FloatingStar({ delay, x, size }: { delay: number; x: number; size: number }) {
  return (
    <motion.div
      className="pointer-events-none absolute bottom-0"
      style={{ left: `${x}%` }}
      initial={{ y: 0, opacity: 1, scale: 0.5 }}
      animate={{ y: -420, opacity: [1, 1, 0], scale: [0.5, 1, 0.6] }}
      transition={{ duration: 2.4, delay, ease: "easeOut" }}
    >
      <Star
        className="fill-yellow-300 text-yellow-300"
        style={{ width: size, height: size }}
      />
    </motion.div>
  );
}

const STARS = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  delay: i * 0.12,
  x: 5 + (i * 6.1) % 90,
  size: 12 + (i % 4) * 6,
}));

export function StoryCelebration({ storyTitle, totalPages, onDone }: Props) {
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after 3 seconds → go back to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      // small delay for exit animation before resetting
      setTimeout(onDone, 350);
    }, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="celebration-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden"
          style={{
            background: "linear-gradient(135deg, oklch(0.28 0.08 180 / 0.82) 0%, oklch(0.22 0.06 270 / 0.88) 100%)",
            backdropFilter: "blur(16px)",
          }}
        >
          {/* Floating stars */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {STARS.map((s) => (
              <FloatingStar key={s.id} delay={s.delay} x={s.x} size={s.size} />
            ))}
          </div>

          {/* Card */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 24, delay: 0.1 }}
            className="relative mx-4 w-full max-w-sm overflow-hidden rounded-3xl p-8 text-center shadow-2xl"
            style={{
              background: "oklch(0.98 0.01 60 / 0.12)",
              border: "1.5px solid oklch(0.98 0.01 60 / 0.22)",
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Trophy */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 16, delay: 0.3 }}
              className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full"
              style={{ background: "linear-gradient(135deg, #f59e0b, #fbbf24)" }}
            >
              <span className="text-4xl">🏆</span>
            </motion.div>

            {/* Stars row */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="mb-4 flex items-center justify-center gap-1.5"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.5 + i * 0.12 }}
                >
                  <Star className="h-7 w-7 fill-yellow-400 text-yellow-400" />
                </motion.div>
              ))}
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className="mb-1 text-2xl font-bold text-white"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}
            >
              అద్భుతం! 🎉
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              className="mb-1 text-sm font-semibold text-yellow-300"
            >
              You finished!
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.72 }}
              className="mb-4 text-xs text-white/70"
            >
              {storyTitle}
            </motion.p>

            {/* XP pill */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, type: "spring", stiffness: 400, damping: 20 }}
              className="mx-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold text-white"
              style={{ background: "linear-gradient(90deg, #059669, #10b981)" }}
            >
              <Star className="h-3.5 w-3.5 fill-white text-white" />
              +{totalPages * 10} XP earned
            </motion.div>

            {/* Auto-dismiss hint */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="mt-4 text-[11px] text-white/40"
            >
              Starting again in a moment…
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
