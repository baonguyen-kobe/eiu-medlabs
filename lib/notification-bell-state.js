/**
 * @typedef {{ markRead: () => Promise<boolean>, close: () => void, navigate?: () => void }} NotificationNavigation
 */

export function notificationBadgeText(unreadCount) {
  if (unreadCount <= 0) return null;
  return unreadCount > 99 ? "99+" : String(unreadCount);
}

/** Keeps navigation behind the durable read mutation. */
export async function markNotificationBeforeNavigation({
  markRead,
  close,
  navigate,
}) {
  if (!(await markRead())) return false;
  close();
  navigate?.();
  return true;
}
