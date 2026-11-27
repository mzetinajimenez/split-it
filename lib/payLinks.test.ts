import { describe, expect, it } from "vitest";
import { buildPayLinks, normalizeHandle, PAYPAL_CURRENCIES, supportsCurrency } from "./payLinks";

const ALL = { venmo: "sam-lee", cashtag: "samlee", paypal: "SamLee" };

const urls = (cents: number, currency: string, note?: string) =>
  Object.fromEntries(buildPayLinks({ handles: ALL, cents, currency, note }).map((l) => [l.service, l.url]));

describe("buildPayLinks: URL formats", () => {
  it("builds all three for USD, in Venmo, Cash App, PayPal order", () => {
    const links = buildPayLinks({ handles: ALL, cents: 3820, currency: "USD", note: "Tacos" });
    expect(links.map((l) => l.label)).toEqual(["Venmo", "Cash App", "PayPal"]);
    expect(links.map((l) => l.url)).toEqual([
      "https://venmo.com/sam-lee?txn=pay&amount=38.20&note=Tacos",
      "https://cash.app/$samlee/38.20",
      "https://paypal.me/SamLee/38.20USD",
    ]);
  });

  it("formats 0.05 and 1,234.50 as plain decimals (no grouping, no symbol)", () => {
    expect(urls(5, "USD")).toEqual({
      venmo: "https://venmo.com/sam-lee?txn=pay&amount=0.05",
      cashapp: "https://cash.app/$samlee/0.05",
      paypal: "https://paypal.me/SamLee/0.05USD",
    });
    expect(urls(123450, "USD").paypal).toBe("https://paypal.me/SamLee/1234.50USD");
    expect(urls(123450, "USD").cashapp).toBe("https://cash.app/$samlee/1234.50");
  });

  it("encodes notes with emoji, & and spaces so they can't break the query", () => {
    const venmo = urls(1000, "USD", "Tacos & 🌮 night").venmo;
    expect(venmo).toBe("https://venmo.com/sam-lee?txn=pay&amount=10.00&note=Tacos+%26+%F0%9F%8C%AE+night");
    const q = new URL(venmo).searchParams;
    expect(q.get("note")).toBe("Tacos & 🌮 night");
    expect(q.get("amount")).toBe("10.00");
    expect([...q.keys()]).toEqual(["txn", "amount", "note"]);
  });

  it("encodes a note that tries to inject parameters or a fragment", () => {
    const q = new URL(urls(100, "USD", "x&amount=999#y?z=1").venmo).searchParams;
    expect(q.getAll("amount")).toEqual(["1.00"]);
    expect(q.get("note")).toBe("x&amount=999#y?z=1");
  });

  it("omits a blank note", () => {
    expect(urls(100, "USD", "   ").venmo).toBe("https://venmo.com/sam-lee?txn=pay&amount=1.00");
  });
});

describe("buildPayLinks: currencies", () => {
  it("JPY: hides Venmo and Cash App, PayPal gets a whole-yen amount", () => {
    expect(urls(1235, "JPY")).toEqual({ paypal: "https://paypal.me/SamLee/1235JPY" });
  });

  it("EUR, GBP: PayPal only", () => {
    expect(urls(1999, "EUR")).toEqual({ paypal: "https://paypal.me/SamLee/19.99EUR" });
    expect(Object.keys(urls(1999, "gbp"))).toEqual(["paypal"]);
  });

  it("a currency PayPal doesn't take hides every link", () => {
    expect(urls(1999, "INR")).toEqual({});
    expect(urls(1999, "KRW")).toEqual({});
  });

  it("HUF / TWD (no decimals at PayPal): whole amounts only, else hidden", () => {
    expect(urls(1500, "HUF").paypal).toBe("https://paypal.me/SamLee/1500HUF"); // HUF has 0 minor digits in ICU
    expect(urls(30000, "TWD").paypal).toBe("https://paypal.me/SamLee/300TWD"); // TWD has 2 in ICU, 0 at PayPal
    expect(urls(30050, "TWD").paypal).toBeUndefined();
  });

  it("supportsCurrency", () => {
    expect(supportsCurrency("venmo", "USD")).toBe(true);
    expect(supportsCurrency("cashapp", "usd")).toBe(true);
    expect(supportsCurrency("venmo", "CAD")).toBe(false);
    expect(supportsCurrency("cashapp", "GBP")).toBe(false);
    expect(supportsCurrency("paypal", "CAD")).toBe(true);
    expect(PAYPAL_CURRENCIES.size).toBe(24);
  });
});

describe("buildPayLinks: what's missing", () => {
  it("no handles, or nothing owed → no links", () => {
    expect(buildPayLinks({ handles: undefined, cents: 100, currency: "USD" })).toEqual([]);
    expect(buildPayLinks({ handles: ALL, cents: 0, currency: "USD" })).toEqual([]);
    expect(buildPayLinks({ handles: ALL, cents: -5, currency: "USD" })).toEqual([]);
  });

  it("only the services with a handle", () => {
    const links = buildPayLinks({ handles: { cashtag: "sam" }, cents: 100, currency: "USD" });
    expect(links.map((l) => l.service)).toEqual(["cashapp"]);
  });

  it("drops a handle that would escape its URL path", () => {
    const evil = { venmo: "a/b?x", cashtag: "../x", paypal: "p#q" };
    expect(buildPayLinks({ handles: evil, cents: 100, currency: "USD" })).toEqual([]);
  });

  it("never does float math: a non-integer amount gives no links", () => {
    expect(buildPayLinks({ handles: ALL, cents: 10.5, currency: "USD" })).toEqual([]);
  });
});

describe("normalizeHandle", () => {
  it("strips @ / $ and whitespace", () => {
    expect(normalizeHandle("venmo", " @sam-lee ")).toBe("sam-lee");
    expect(normalizeHandle("cashapp", "$samlee")).toBe("samlee");
    expect(normalizeHandle("paypal", "SamLee")).toBe("SamLee");
  });

  it("accepts a pasted profile URL", () => {
    expect(normalizeHandle("venmo", "https://venmo.com/u/sam-lee")).toBe("sam-lee");
    expect(normalizeHandle("venmo", "venmo.com/sam-lee?txn=pay")).toBe("sam-lee");
    expect(normalizeHandle("cashapp", "https://cash.app/$samlee/12")).toBe("samlee");
    expect(normalizeHandle("paypal", "https://www.paypal.me/SamLee/10USD")).toBe("SamLee");
    expect(normalizeHandle("paypal", "paypal.com/paypalme/SamLee")).toBe("SamLee");
  });

  it("blank stays blank", () => expect(normalizeHandle("venmo", "  ")).toBe(""));
});
