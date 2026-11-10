"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./VoiceWave.module.css";

const BAR_PITCH = 4;
const MAX_BARS = 160;
const SAMPLE_INTERVAL_MS = 75;
const MIN_SCALE = 0.12;

/** Moving history of the measured microphone signal; the caller owns the audio graph. */
export function VoiceWave({ analyser, onSignal }: {
  analyser: AnalyserNode | null;
  onSignal?: (amplitude: number) => void;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const onSignalRef = useRef(onSignal);
  const [barCount, setBarCount] = useState(64);
  useEffect(() => { onSignalRef.current = onSignal; }, [onSignal]);

  // Keep the actual gap fixed as the input grows; never distribute spare width
  // between bars. Only resize the number of bars when the container changes.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const count = Math.max(1, Math.min(MAX_BARS, Math.floor((element.clientWidth + 2) / BAR_PITCH)));
      setBarCount(previous => previous === count ? previous : count);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!analyser) return;
    const samples = new Uint8Array(analyser.fftSize);
    const history = Array<number>(barCount).fill(MIN_SCALE);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let previousTime = 0;
    let smoothed = 0;

    const update = (time: number) => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const sample = (samples[i] - 128) / 128;
        sum += sample * sample;
      }
      const amplitude = Math.sqrt(sum / samples.length);
      onSignalRef.current?.(amplitude);
      smoothed += (Math.min(1, amplitude * 7) - smoothed) * 0.24;
      if (!previousTime || time - previousTime >= SAMPLE_INTERVAL_MS) {
        previousTime = time;
        history.shift();
        history.push(Math.max(MIN_SCALE, Math.sqrt(smoothed)));
        if (!motion.matches) {
          for (let i = 0; i < barCount; i++) {
            const bar = bars.current[i];
            if (bar) bar.style.transform = `scaleY(${history[i]})`;
          }
        }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [analyser, barCount]);

  return <span ref={container} className={styles.wave} aria-hidden="true">
    {Array.from({ length: barCount }, (_, i) => <span key={i} ref={node => { bars.current[i] = node; }} className={styles.bar} />)}
  </span>;
}
