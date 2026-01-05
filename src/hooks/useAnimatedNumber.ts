import { useState, useEffect, useRef } from 'react';

interface UseAnimatedNumberOptions {
  duration?: number; // Animation duration in ms
  onComplete?: () => void; // Callback when animation completes
}

/**
 * Hook to animate a number counting up from a start value to an end value.
 * Returns the current animated value.
 *
 * @param targetValue - The value to animate to
 * @param startValue - Optional starting value (defaults to 0 or previous target)
 * @param options - Animation options
 */
export function useAnimatedNumber(
  targetValue: number,
  startValue?: number,
  options: UseAnimatedNumberOptions = {}
): number {
  const { duration = 1500, onComplete } = options;
  const [currentValue, setCurrentValue] = useState(targetValue);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const fromRef = useRef<number>(targetValue);
  const toRef = useRef<number>(targetValue);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    // If startValue is provided and different from target, animate
    if (startValue !== undefined && startValue !== targetValue) {
      fromRef.current = startValue;
      toRef.current = targetValue;
      hasAnimatedRef.current = true;

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) {
          startTimeRef.current = timestamp;
        }

        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out cubic for a nice deceleration effect
        const eased = 1 - Math.pow(1 - progress, 3);

        const from = fromRef.current;
        const to = toRef.current;
        const value = Math.round(from + (to - from) * eased);

        setCurrentValue(value);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setCurrentValue(to);
          startTimeRef.current = null;
          if (onComplete) {
            onComplete();
          }
        }
      };

      // Cancel any existing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      startTimeRef.current = null;
      animationRef.current = requestAnimationFrame(animate);
    } else if (!hasAnimatedRef.current) {
      // No animation requested, just set the value
      setCurrentValue(targetValue);
    } else {
      // Target changed without startValue after initial animation
      // This handles subsequent updates after the animation
      toRef.current = targetValue;
      setCurrentValue(targetValue);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, startValue, duration, onComplete]);

  return currentValue;
}

/**
 * Simpler hook for triggering a token count-up animation.
 * Call triggerAnimation with oldValue and newValue to start.
 */
export function useTokenAnimation() {
  const [animationState, setAnimationState] = useState<{
    from: number;
    to: number;
    isAnimating: boolean;
  } | null>(null);

  const triggerAnimation = (from: number, to: number) => {
    if (from < to) {
      setAnimationState({ from, to, isAnimating: true });
    }
  };

  const clearAnimation = () => {
    setAnimationState(null);
  };

  return {
    animationState,
    triggerAnimation,
    clearAnimation,
  };
}
