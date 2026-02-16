export function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) {
		return "just now";
	}
	if (diffMinutes < 60) {
		return `${diffMinutes} min ago`;
	}
	if (diffHours < 24) {
		return `${diffHours} hr ago`;
	}
	if (diffDays === 1) {
		return "yesterday";
	}
	if (diffDays < 7) {
		return `${diffDays} days ago`;
	}
	return date.toLocaleDateString();
}
