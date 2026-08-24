"use client";

import { Bell } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type UserNotification = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

function formatRelativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  );

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function refreshNotifications() {
      const { data } = await supabase
        .from("user_notifications")
        .select("id,title,body,href,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (active && data) setNotifications(data as UserNotification[]);
    }

    void supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      if (!active || !id) return;
      setUserId(id);
      void refreshNotifications();
      channel = supabase
        .channel(`user-notifications-${id}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_notifications",
            filter: `recipient_id=eq.${id}`,
          },
          () => void refreshNotifications(),
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id && !notification.read_at
          ? { ...notification, read_at: new Date().toISOString() }
          : notification,
      ),
    );
  }

  async function markAllRead() {
    if (!userId || unreadCount === 0) return;
    const readAt = new Date().toISOString();
    const supabase = createClient();
    await supabase
      .from("user_notifications")
      .update({ read_at: readAt })
      .eq("recipient_id", userId)
      .is("read_at", null);
    setNotifications((current) =>
      current.map((notification) =>
        notification.read_at
          ? notification
          : { ...notification, read_at: readAt },
      ),
    );
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        aria-controls="notification-popover"
        aria-expanded={open}
        aria-label={
          unreadCount ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"
        }
        className="icon-button notification-bell-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <Bell size={20} />
        {unreadCount ? (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <section
          aria-label="Thông báo"
          className="notification-popover"
          id="notification-popover"
        >
          <div className="notification-popover-header">
            <strong>Thông báo</strong>
            <button
              className="button button-secondary notification-read-all"
              disabled={!unreadCount}
              onClick={() => void markAllRead()}
              type="button"
            >
              Đánh dấu tất cả đã đọc
            </button>
          </div>
          <div className="notification-list">
            {notifications.length ? (
              notifications.map((notification) => (
                <button
                  className={`notification-item${notification.read_at ? "" : " unread"}`}
                  key={notification.id}
                  onClick={() => {
                    void markRead(notification.id);
                    setOpen(false);
                    if (notification.href) router.push(notification.href);
                  }}
                  type="button"
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                  <small>{formatRelativeTime(notification.created_at)}</small>
                </button>
              ))
            ) : (
              <p className="notification-empty">Chưa có thông báo.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
