/**
 * Shared framer-motion animation variants and transition configurations.
 *
 * Easing: cubic-bezier(0.25, 0.1, 0.25, 1.0) for all transitions.
 * Durations: micro-interactions 150ms, layout transitions 250ms, page crossfade 200ms.
 * The only continuous animation is the CSS status-pulse (defined in globals.css).
 * Structural elements (sidebar, panels, tooltips) do not animate.
 */

// -- Shared easing curve --

export const ease = [0.25, 0.1, 0.25, 1.0] as const;

// -- Duration tokens (seconds) --

export const duration = {
	micro: 0.15,
	layout: 0.25,
	page: 0.2,
} as const;

// -- Page crossfade: opacity 0-1, 200ms, no stagger --

export const pageVariants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

export const pageTransition = {
	duration: duration.page,
	ease: ease as unknown as number[],
};

export const pageVariantsReduced = {
	initial: { opacity: 1 },
	animate: { opacity: 1 },
	exit: { opacity: 1 },
};

export const pageTransitionReduced = {
	duration: 0,
};

// -- Feed item entrance: slide up 8px + fade, 40ms stagger --

export const staggerContainer = {
	animate: {
		transition: {
			staggerChildren: 0.04,
		},
	},
};

export const staggerContainerReduced = {
	animate: {
		transition: {
			staggerChildren: 0,
		},
	},
};

export const staggerItem = {
	initial: { opacity: 0, y: 8 },
	animate: {
		opacity: 1,
		y: 0,
		transition: { duration: duration.page, ease: ease as unknown as number[] },
	},
};

export const staggerItemReduced = {
	initial: { opacity: 1, y: 0 },
	animate: { opacity: 1, y: 0 },
};

// -- Micro-interactions (hover, focus): 150ms --

export const cardHover = {
	scale: 1.02,
	y: -1,
	transition: { duration: duration.micro, ease: ease as unknown as number[] },
};

export const cardTap = {
	scale: 0.97,
	transition: { duration: duration.micro, ease: ease as unknown as number[] },
};

// -- Overlay (command palette) animations: 150ms micro-interaction --

export const overlayBackdropVariants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

export const overlayBackdropTransition = {
	duration: duration.micro,
	ease: ease as unknown as number[],
};

export const overlayPanelVariants = {
	initial: { opacity: 0, scale: 0.95 },
	animate: { opacity: 1, scale: 1 },
	exit: { opacity: 0, scale: 0.95 },
};

export const overlayPanelTransition = {
	duration: duration.micro,
	ease: ease as unknown as number[],
};
