"use client";

import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Clock3 } from "@/components/icons";
import {
  DEFAULT_TIME_PICKER_ALLOWED_VALUES,
  TIME_PICKER_HOURS,
  TIME_PICKER_MINUTES,
  getDefaultInvalidMessage,
  getHoursForAllowedValues,
  getMinutesForHour,
  isValidTime,
} from "@/lib/time-picker-utils";

export {
  DEFAULT_TIME_PICKER_ALLOWED_VALUES,
  TIME_PICKER_HOURS,
  TIME_PICKER_MINUTES,
  getDefaultInvalidMessage,
  getHoursForAllowedValues,
  getMinutesForHour,
  isValidTime,
};

export type TimePickerProps = {
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  className?: string;
  allowedValues?: readonly string[];
  invalidMessage?: string;
};

export function TimePicker({
  name,
  id,
  value,
  defaultValue = "",
  onChange,
  onBlur,
  placeholder = "HH:mm",
  required = false,
  disabled = false,
  readOnly = false,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  className = "",
  allowedValues,
  invalidMessage,
}: TimePickerProps) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-time-input`;
  const errorId = `${inputId}-error`;

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = isControlled ? (value ?? "") : internalValue;

  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [touched, setTouched] = useState(false);
  const [pendingHour, setPendingHour] = useState<string | null>(null);
  const [pendingMinute, setPendingMinute] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isCurrentValid = isValidTime(currentValue, allowedValues);
  const activeHour = isCurrentValid ? currentValue.slice(0, 2) : pendingHour;
  const activeMinute = isCurrentValid
    ? currentValue.slice(3, 5)
    : pendingMinute;

  const hoursList = getHoursForAllowedValues(allowedValues);
  const minutesList = getMinutesForHour(activeHour, allowedValues);

  const isInvalid =
    ariaInvalid !== undefined
      ? ariaInvalid
      : Boolean(currentValue) &&
        !isCurrentValid &&
        (touched || currentValue.length >= 5);

  const displayErrorMessage =
    invalidMessage ?? getDefaultInvalidMessage(allowedValues);

  // Update input HTML5 custom validity
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (currentValue && !isCurrentValid) {
      input.setCustomValidity(displayErrorMessage);
    } else {
      input.setCustomValidity("");
    }
  }, [currentValue, isCurrentValid, displayErrorMessage]);

  // Close on outside pointer click
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  // Dynamic popover positioning
  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popoverHeight = 260;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpwards =
        spaceBelow < popoverHeight && rect.top > popoverHeight;

      setPopoverStyle({
        position: "fixed",
        left: `${Math.max(8, rect.left)}px`,
        top: openUpwards ? undefined : `${rect.bottom + 4}px`,
        bottom: openUpwards
          ? `${window.innerHeight - rect.top + 4}px`
          : undefined,
        zIndex: 800,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function triggerChange(nextValue: string) {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  }

  function handleControlClick() {
    if (disabled || readOnly) return;
    inputRef.current?.focus();
    setOpen(true);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextText = event.target.value;
    triggerChange(nextText);
    if (isValidTime(nextText, allowedValues)) {
      setPendingHour(nextText.slice(0, 2));
      setPendingMinute(nextText.slice(3, 5));
    }
  }

  function handleInputBlur(event: FocusEvent<HTMLInputElement>) {
    setTouched(true);
    onBlur?.(event);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      inputRef.current?.focus();
    } else if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleHourSelect(hour: string) {
    setPendingHour(hour);
    const validMinutesForHour = getMinutesForHour(hour, allowedValues);
    const minuteToUse =
      activeMinute && validMinutesForHour.includes(activeMinute)
        ? activeMinute
        : (validMinutesForHour[0] ?? "00");
    setPendingMinute(minuteToUse);
    const nextValue = `${hour}:${minuteToUse}`;
    triggerChange(nextValue);
    // Keep popover open so user can select minute
  }

  function handleMinuteSelect(minute: string) {
    setPendingMinute(minute);
    const hourToUse = activeHour ?? hoursList[0] ?? "07";
    setPendingHour(hourToUse);
    const nextValue = `${hourToUse}:${minute}`;
    triggerChange(nextValue);
    // Minute selection completes choice -> close popover
    setOpen(false);
    inputRef.current?.focus();
  }

  const effectiveAriaDescribedBy = isInvalid
    ? ariaDescribedBy
      ? `${ariaDescribedBy} ${errorId}`
      : errorId
    : ariaDescribedBy;

  return (
    <div
      ref={rootRef}
      className={`time-picker ${className}`.trim()}
      onClick={handleControlClick}
    >
      <div
        className={`time-picker-control ${isInvalid ? "is-invalid" : ""} ${disabled ? "is-disabled" : ""}`}
      >
        <Clock3 size={16} aria-hidden="true" className="time-picker-icon" />
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={5}
          value={currentValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={ariaLabel}
          aria-describedby={effectiveAriaDescribedBy}
          aria-invalid={isInvalid ? "true" : undefined}
          aria-haspopup="dialog"
          className="time-picker-input"
        />
      </div>

      {isInvalid ? (
        <div id={errorId} className="time-picker-error" role="alert">
          {displayErrorMessage}
        </div>
      ) : null}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              className="time-picker-popover"
              style={popoverStyle}
              role="dialog"
              aria-label="Chọn giờ và phút"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                  inputRef.current?.focus();
                }
              }}
            >
              <div className="time-picker-columns">
                <div
                  className="time-picker-column"
                  role="listbox"
                  aria-label="Giờ"
                >
                  <div className="time-picker-column-header">Giờ</div>
                  <div className="time-picker-options">
                    {hoursList.map((hour) => {
                      const isSelected = activeHour === hour;
                      return (
                        <button
                          key={hour}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`time-picker-option ${isSelected ? "selected" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHourSelect(hour);
                          }}
                        >
                          {hour}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  className="time-picker-column"
                  role="listbox"
                  aria-label="Phút"
                >
                  <div className="time-picker-column-header">Phút</div>
                  <div className="time-picker-options">
                    {minutesList.map((minute) => {
                      const isSelected = activeMinute === minute;
                      return (
                        <button
                          key={minute}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`time-picker-option ${isSelected ? "selected" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMinuteSelect(minute);
                          }}
                        >
                          {minute}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
