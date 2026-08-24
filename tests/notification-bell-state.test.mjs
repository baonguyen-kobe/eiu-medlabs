import assert from "node:assert/strict";
import test from "node:test";

import {
  markNotificationBeforeNavigation,
  notificationBadgeText,
} from "../lib/notification-bell-state.js";

test("notification badge uses the exact unread total, independently of the 30-row list", () => {
  assert.equal(notificationBadgeText(0), null);
  assert.equal(notificationBadgeText(1), "1");
  assert.equal(notificationBadgeText(31), "31");
  assert.equal(notificationBadgeText(100), "99+");
});

test("notification navigation waits for a successful durable read", async () => {
  const events = [];
  const result = await markNotificationBeforeNavigation({
    markRead: async () => {
      events.push("read");
      return true;
    },
    close: () => events.push("close"),
    navigate: () => events.push("navigate"),
  });

  assert.equal(result, true);
  assert.deepEqual(events, ["read", "close", "navigate"]);
});

test("notification navigation leaves the popover open when the read mutation fails", async () => {
  const events = [];
  const result = await markNotificationBeforeNavigation({
    markRead: async () => false,
    close: () => events.push("close"),
    navigate: () => events.push("navigate"),
  });

  assert.equal(result, false);
  assert.deepEqual(events, []);
});
