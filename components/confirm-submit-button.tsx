"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function ConfirmSubmitButton({
  children,
  message,
  className,
  name,
  value,
  disabled,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function confirmSubmit() {
    const button = buttonRef.current;
    setOpen(false);
    if (button?.form) button.form.requestSubmit(button);
  }

  return (
    <>
      <button
        ref={buttonRef}
        className={className}
        name={name}
        value={value}
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title="Xác nhận thao tác"
        description={message}
        confirmLabel="Xác nhận"
        onConfirm={confirmSubmit}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
