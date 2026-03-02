/**
 * Shared framer-motion animation variants and transition configurations.
 * Centralizes all motion definitions to prevent duplication across components.
 */

// -- Page transitions --

export const pageVariants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -8 },
};

export const pageTransition = {
	duration: 0.2,
	ease: "easeOut" as const,
};

export const pageVariantsReduced = {
	initial: { opacity: 1, y: 0 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 1, y: 0 },
};

export const pageTransitionReduced = {
	duration: 0,
};

// -- List stagger --

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
	animate: { opacity: 1, y: 0 },
};

export const staggerItemReduced = {
	initial: { opacity: 1, y: 0 },
	animate: { opacity: 1, y: 0 },
};

// -- Card hover/tap micro-interactions --

export const cardHover = {
	scale: 1.02,
	y: -1,
	transition: { type: "spring" as const, stiffness: 400, damping: 25 },
};

export const cardTap = {
	scale: 0.97,
	transition: { duration: 0.08 },
};

// -- Overlay (command palette) animations --

export const overlayBackdropVariants = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
};

export const overlayBackdropTransition = {
	duration: 0.15,
};

export const overlayPanelVariants = {
	initial: { opacity: 0, scale: 0.95 },
	animate: { opacity: 1, scale: 1 },
	exit: { opacity: 0, scale: 0.95 },
};

export const overlayPanelTransition = {
	duration: 0.15,
	ease: "easeOut" as const,
};
