"use client";

/*
 * split-it UI primitives. Presentational only: no data imports, no Dexie, no repo. Colours,
 * fonts and radii come from the tokens in app/globals.css. Every interactive control has a
 * ≥ 44px hit area, hover is `md:hover:` only, and press states use `active:`.
 */

import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type SVGProps,
} from "react";
import { formatMoney } from "@/lib/money";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------------------------------ */
/* HeaderShell                                                                                */
/* ------------------------------------------------------------------------------------------ */

export function HeaderShell({
  title,
  back,
  actions,
  subtitle,
}: {
  title: ReactNode;
  /** A back control (typically a `Button variant="ghost"` or a Link) rendered at the start. */
  back?: ReactNode;
  /** Trailing actions. */
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-ground pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-14 items-center gap-1 px-2">
        {back ? <div className="flex shrink-0 items-center">{back}</div> : <div className="w-2" />}
        <div className="min-w-0 flex-1 py-2">
          <h1 className="truncate font-display text-lg leading-tight font-bold text-ink">{title}</h1>
          {subtitle ? <p className="truncate text-sm text-ink-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Button                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent active:bg-accent-deep md:hover:bg-accent-deep",
  secondary:
    "border border-rule-strong bg-raised text-ink active:bg-ground-deep md:hover:bg-ground-deep",
  ghost: "text-ink active:bg-ground-deep md:hover:bg-ground-deep",
  danger: "bg-danger text-on-accent active:bg-danger-deep md:hover:bg-danger-deep",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  className,
  type = "button",
  children,
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** `md` is the default 44px control; `lg` is a 52px full-width call to action. */
  size?: "md" | "lg";
  /** A leading glyph. With no children the button is icon-only: give it an `aria-label`. */
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  const iconOnly = icon != null && children == null;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-sm font-medium select-none",
        "transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "lg" ? "min-h-13 px-5 text-base" : "min-h-11 px-4 text-sm",
        iconOnly && "min-w-11 px-0",
        buttonVariants[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Chip                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** A toggle chip. The visual pill is 32px tall; the hit area is 44px. */
export function Chip({
  pressed,
  onPressedChange,
  children,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "aria-pressed"> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cx("group inline-flex min-h-11 items-center select-none", className)}
      {...rest}
    >
      <span
        className={cx(
          "inline-flex h-8 items-center gap-1 rounded-sm border px-3 text-sm font-medium transition-colors",
          pressed
            ? "border-accent bg-accent text-on-accent group-active:bg-accent-deep md:group-hover:bg-accent-deep"
            : "border-rule-strong bg-raised text-ink group-active:bg-ground-deep md:group-hover:bg-ground-deep",
        )}
      >
        {pressed ? <CheckGlyph className="size-4" /> : null}
        {children}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* EmptyState                                                                                 */
/* ------------------------------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="text-ink-muted [&>svg]:size-10">{icon}</div> : null}
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {body ? <p className="max-w-xs text-sm text-ink-muted">{body}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Money                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/**
 * A money value: `formatMoney` in mono tabular figures. The sign styling lives here and only
 * here. A negative amount (a discount) renders with a true minus sign (U+2212) in front of the
 * formatted magnitude; `signed` also prefixes a "+" on positive amounts, for adjustment lines.
 * No arithmetic happens here beyond taking the magnitude to print.
 */
export function Money({
  cents,
  currency,
  signed = false,
  className,
}: {
  cents: number;
  currency: string;
  signed?: boolean;
  className?: string;
}) {
  const negative = cents < 0;
  const sign = negative ? "−" : signed && cents > 0 ? "+" : "";
  return (
    <span className={cx("font-mono tabular whitespace-nowrap", className)}>
      {sign}
      {formatMoney(negative ? -cents : cents, currency)}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Avatar / AvatarStack                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** Static class names so Tailwind generates every person colour. Index with `colorIndex % 8`. */
export const PERSON_BG = [
  "bg-person-0",
  "bg-person-1",
  "bg-person-2",
  "bg-person-3",
  "bg-person-4",
  "bg-person-5",
  "bg-person-6",
  "bg-person-7",
] as const;

export const PERSON_COLOR_COUNT = PERSON_BG.length;

export type AvatarSize = "sm" | "md" | "lg";

const avatarSizes: Record<AvatarSize, string> = {
  sm: "size-6 text-[0.625rem]",
  md: "size-9 text-sm",
  lg: "size-12 text-base",
};

export function Avatar({
  initials,
  colorIndex,
  size = "md",
  label,
  className,
}: {
  /** Up to two letters. The `sm` size (24px) shows only the first. */
  initials: string;
  colorIndex: number;
  size?: AvatarSize;
  /** The person's name, when the avatar is the only thing naming them. Omit when decorative
   *  (the name is printed beside it), and the avatar is `aria-hidden`. */
  label?: string;
  className?: string;
}) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <span
      {...a11y}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-mono font-semibold text-on-person uppercase select-none",
        PERSON_BG[((colorIndex % PERSON_COLOR_COUNT) + PERSON_COLOR_COUNT) % PERSON_COLOR_COUNT],
        avatarSizes[size],
        className,
      )}
    >
      {size === "sm" ? initials.slice(0, 1) : initials}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 3,
  size = "sm",
  label,
}: {
  people: readonly { id: string; initials: string; colorIndex: number }[];
  /** At most this many avatars; the rest collapse into "+k". */
  max?: number;
  size?: AvatarSize;
  /** Accessible summary, e.g. "Claimed by Ana and Ben". Omit when the stack is decorative. */
  label?: string;
}) {
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const extra = people.length - shown.length;
  return (
    <span
      className="inline-flex items-center"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {shown.map((p, i) => (
        <Avatar
          key={p.id}
          initials={p.initials}
          colorIndex={p.colorIndex}
          size={size}
          className={cx("ring-2 ring-ground", i > 0 && "-ml-1.5")}
        />
      ))}
      {extra > 0 ? (
        <span
          className={cx(
            "-ml-1.5 inline-flex items-center justify-center rounded-full bg-ink font-mono font-semibold text-ground ring-2 ring-ground tabular",
            avatarSizes[size],
          )}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Stepper                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  format,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** What is being counted, e.g. "Ana's shares". Used for the button labels. */
  label: string;
  format?: (value: number) => ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={stepperButton}
      >
        <MinusGlyph className="size-4" />
      </button>
      <output aria-live="polite" className="min-w-8 text-center font-mono text-base font-medium tabular">
        {format ? format(value) : value}
      </output>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={stepperButton}
      >
        <PlusGlyph className="size-4" />
      </button>
    </div>
  );
}

const stepperButton = cx(
  "inline-flex size-11 items-center justify-center rounded-sm border border-rule-strong bg-raised text-ink",
  "active:bg-ground-deep md:hover:bg-ground-deep disabled:pointer-events-none disabled:opacity-40",
);

/* ------------------------------------------------------------------------------------------ */
/* SegmentedControl                                                                           */
/* ------------------------------------------------------------------------------------------ */

/** A single-choice control (radiogroup) with arrow-key navigation and a roving tab stop. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    const radios = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios[(i + step + options.length) % options.length]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx("inline-flex rounded-sm border border-rule-strong bg-raised p-0.5", className)}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              "min-h-11 min-w-11 flex-1 rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-colors select-none",
              checked
                ? "bg-accent text-on-accent"
                : "text-ink active:bg-ground-deep md:hover:bg-ground-deep",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Field / TextInput / MoneyInput                                                             */
/* ------------------------------------------------------------------------------------------ */

/**
 * A labelled form field. `children` is a render function receiving the control's id and the
 * id of its description (hint or error), so the label and `aria-describedby` are always wired.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** An error message. Rendered in `danger`, and the only use of `danger` in a form. */
  error?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const hasDesc = error != null || hint != null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy: hasDesc ? descId : undefined, invalid: error != null })}
      {error != null ? (
        <p id={descId} className="text-sm text-danger">
          {error}
        </p>
      ) : hint != null ? (
        <p id={descId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputBase = cx(
  "min-h-11 w-full rounded-sm border bg-raised px-3 text-base text-ink",
  "placeholder:text-ink-muted aria-invalid:border-danger",
  "focus-visible:border-ink",
);

export function TextInput({
  className,
  invalid,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(inputBase, "border-rule-strong", className)}
      {...rest}
    />
  );
}

/**
 * A money text field. It only collects text: parse it with `parseMoney` at the edge. Decimal
 * keypad, mono tabular figures, 16px so iOS doesn't focus-zoom.
 */
export function MoneyInput({
  className,
  invalid,
  prefix,
  ref,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "prefix"> & {
  invalid?: boolean;
  /** A currency symbol shown inside the field, e.g. "$". */
  prefix?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="relative">
      {prefix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-base text-ink-muted"
        >
          {prefix}
        </span>
      ) : null}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={cx(
          inputBase,
          "border-rule-strong text-right font-mono tabular",
          prefix && "pl-8",
          className,
        )}
        {...rest}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Glyphs                                                                                     */
/* ------------------------------------------------------------------------------------------ */

type GlyphProps = SVGProps<SVGSVGElement>;

function Glyph({ children, className, ...rest }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      focusable="false"
      className={cx("size-5 shrink-0", className)}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlusGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);

export const MinusGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 12h14" />
  </Glyph>
);

export const ChevronGlyph = ({ direction = "right", ...p }: GlyphProps & { direction?: "left" | "right" | "up" | "down" }) => {
  const d = { right: "M9 5l7 7-7 7", left: "M15 5l-7 7 7 7", down: "M5 9l7 7 7-7", up: "M5 15l7-7 7 7" }[direction];
  return (
    <Glyph {...p}>
      <path d={d} />
    </Glyph>
  );
};

export const CheckGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Glyph>
);

export const TrashGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6" />
  </Glyph>
);

export const ShareGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12v8.5h14V12" />
  </Glyph>
);

/** A receipt with a torn (zig-zag) bottom edge. */
export const ReceiptGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5.5 3h13v18l-2.17-1.5-2.16 1.5L12 19.5 9.83 21l-2.16-1.5L5.5 21z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </Glyph>
);

export const UsersGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M15.5 5.6a3.25 3.25 0 010 5.8M17.5 14.9c2.1.7 3.5 2.6 3.5 5.1" />
  </Glyph>
);

/** One line forking into two: a shared item split between people. */
export const SplitGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 21v-7.5L6 7.5M12 13.5l6-6M4.5 4h4v4M19.5 4h-4v4" />
  </Glyph>
);

/** A coin with a plus: the tip. */
export const TipGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v8M8 12h8" />
  </Glyph>
);

/** Two ruled totals with a double underline, as at the foot of a receipt. */
export const SummaryGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 6h10M4 10.5h10M17 6h3M17 10.5h3M4 15h16M4 18.5h16" />
  </Glyph>
);
