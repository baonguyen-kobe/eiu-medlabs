"use client";

import { ChevronRight, Search } from "@/components/icons";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ComboboxOption = {
  value: string;
  label: string;
  keywords?: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .trim();
}

export function SearchableCombobox({
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  onQueryChange,
  placeholder = "Chọn hoặc nhập để tìm…",
  emptyLabel,
  required = false,
  disabled = false,
  ariaLabel,
}: {
  name?: string;
  options: ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;
  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({});
  const displayQuery = open ? query : (selectedOption?.label ?? "");

  const filtered = useMemo(() => {
    const term = normalize(query);
    if (!term || query === selectedOption?.label) return options;
    return options.filter((option) =>
      normalize(`${option.label} ${option.keywords ?? ""}`).includes(term),
    );
  }, [options, query, selectedOption?.label]);

  const visibleOptions = useMemo(
    () => [
      ...(emptyLabel ? [{ value: "", label: emptyLabel }] : []),
      ...filtered,
    ],
    [emptyLabel, filtered],
  );

  const activeOptionValue = visibleOptions.some(
    (option) => option.value === activeValue,
  )
    ? activeValue
    : null;

  const optionId = useCallback(
    (optionValue: string) =>
      `${listboxId}-option-${encodeURIComponent(optionValue || "empty")}`,
    [listboxId],
  );

  function closeList() {
    setOpen(false);
    setActiveValue(null);
  }

  function select(nextValue: string, focusInput = false) {
    const nextOption = options.find((option) => option.value === nextValue);
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
    setQuery(nextOption?.label ?? "");
    closeList();
    if (focusInput) requestAnimationFrame(() => inputRef.current?.focus());
  }

  function setActiveAt(index: number) {
    const option = visibleOptions[index];
    setActiveValue(option?.value ?? null);
  }

  function moveActive(direction: 1 | -1) {
    if (!visibleOptions.length) return;
    const currentIndex = visibleOptions.findIndex(
      (option) => option.value === activeOptionValue,
    );
    const nextIndex =
      currentIndex < 0
        ? direction === 1
          ? 0
          : visibleOptions.length - 1
        : (currentIndex + direction + visibleOptions.length) %
          visibleOptions.length;
    setActiveAt(nextIndex);
  }

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !listRef.current?.contains(event.target as Node)
      )
        closeList();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!open || activeOptionValue === null) return;
    document
      .getElementById(optionId(activeOptionValue))
      ?.scrollIntoView({ block: "nearest" });
  }, [activeOptionValue, open, optionId]);

  useEffect(() => {
    if (!open) return;
    function positionList() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      setListStyle({
        left: rect.left,
        width: rect.width,
        top: spaceBelow >= 220 ? rect.bottom + 5 : undefined,
        bottom:
          spaceBelow < 220 ? window.innerHeight - rect.top + 5 : undefined,
      });
    }
    positionList();
    window.addEventListener("resize", positionList);
    window.addEventListener("scroll", positionList, true);
    return () => {
      window.removeEventListener("resize", positionList);
      window.removeEventListener("scroll", positionList, true);
    };
  }, [open]);

  return (
    <div className="searchable-combobox" ref={rootRef}>
      {name ? <input name={name} type="hidden" value={selectedValue} /> : null}
      <span className="searchable-combobox-control">
        <Search size={17} />
        <input
          ref={inputRef}
          aria-activedescendant={
            open && activeOptionValue !== null
              ? optionId(activeOptionValue)
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          required={required}
          role="combobox"
          value={displayQuery}
          onChange={(event) => {
            setQuery(event.target.value);
            onQueryChange?.(event.target.value);
            if (selectedValue) {
              if (!controlled) setInternalValue("");
              onChange?.("");
            }
            setActiveValue(null);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery(selectedOption?.label ?? "");
            setOpen(true);
          }}
          onKeyDown={(event) => {
            switch (event.key) {
              case "ArrowDown":
                event.preventDefault();
                if (!open) {
                  setOpen(true);
                  setActiveAt(0);
                } else {
                  moveActive(1);
                }
                break;
              case "ArrowUp":
                event.preventDefault();
                if (!open) {
                  setOpen(true);
                  setActiveAt(visibleOptions.length - 1);
                } else {
                  moveActive(-1);
                }
                break;
              case "Home":
                if (open && visibleOptions.length) {
                  event.preventDefault();
                  setActiveAt(0);
                }
                break;
              case "End":
                if (open && visibleOptions.length) {
                  event.preventDefault();
                  setActiveAt(visibleOptions.length - 1);
                }
                break;
              case "Enter":
                if (open && activeOptionValue !== null) {
                  event.preventDefault();
                  select(activeOptionValue, true);
                }
                break;
              case "Escape":
                if (open) {
                  event.preventDefault();
                  closeList();
                  requestAnimationFrame(() => inputRef.current?.focus());
                }
                break;
              case "Tab":
                if (open) closeList();
                break;
            }
          }}
        />
        <ChevronRight className="combobox-chevron" size={16} />
      </span>
      {open && !disabled
        ? createPortal(
            <div
              className="searchable-combobox-list searchable-combobox-portal"
              ref={listRef}
              style={listStyle}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
            >
              {visibleOptions.map((option) => (
                <button
                  className={`${option.value === selectedValue ? "selected" : ""} ${option.value === activeOptionValue ? "active" : ""}`}
                  id={optionId(option.value)}
                  key={option.value || "empty"}
                  role="option"
                  aria-selected={option.value === selectedValue}
                  tabIndex={-1}
                  type="button"
                  onClick={() => select(option.value)}
                  onMouseMove={() => setActiveValue(option.value)}
                >
                  {option.label}
                </button>
              ))}
              {!visibleOptions.length ? (
                <p role="status">Không tìm thấy kết quả phù hợp.</p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
