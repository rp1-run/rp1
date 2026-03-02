import { useMediaQuery } from "./useMediaQuery";

export function usePrefersReducedMotion(): boolean {
	return useMediaQuery("(prefers-reduced-motion: reduce)");
}
