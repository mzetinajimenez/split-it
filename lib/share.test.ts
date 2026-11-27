import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare, SHARE_VERSION, ShareDecodeError, shareUrl, toSnapshot } from "./share";
import { amount, makeAdjustment, makeBill, makeItem, makePerson, mulberry32, percent, propertySeed, randInt, randomBill } from "./testing/billFactory";
import type { Bill, BillSnapshot } from "./types";

/** Rewrite every embedded id to its position, so snapshots compare modulo ids. */
function byPosition(s: BillSnapshot): BillSnapshot {
  const idx = new Map(s.people.map((p, i) => [p.id, String(i)]));
  const ref = (id: string) => idx.get(id) ?? `?${id}`;
  return {
    ...s,
    people: s.people.map((p, i) => ({ ...p, id: String(i) })),
    items: s.items.map((it, i) => ({
      ...it,
      id: String(i),
      claims: Object.fromEntries(Object.entries(it.claims).map(([pid, n]) => [ref(pid), n])),
    })),
    adjustments: s.adjustments.map((a, i) => ({ ...a, id: String(i) })),
    paidBy: s.paidBy === null ? null : ref(s.paidBy),
    settled: s.settled.map(ref),
  };
}

/** Deflate-raw + base64url arbitrary JSON under a version prefix (to forge payloads). */
async function forge(value: unknown, version = "1"): Promise<string> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const b64 = Buffer.from(bytes).toString("base64url");
  return `${version}.${b64}`;
}

async function reasonOf(payload: string): Promise<string> {
  try {
    await decodeShare(payload);
  } catch (err) {
    expect(err).toBeInstanceOf(ShareDecodeError);
    return (err as ShareDecodeError).reason;
  }
  throw new Error(`decodeShare did not throw for ${payload}`);
}

const UUID_A = "6f1c2a4e-8b1d-4c3e-9f00-111111111111";
const UUID_B = "6f1c2a4e-8b1d-4c3e-9f00-222222222222";

function sampleBill(): Bill {
  return makeBill({
    id: "row-id",
    title: "Tacos",
    currency: "USD",
    people: [makePerson(UUID_A, { name: "Sam", colorIndex: 3 }), makePerson(UUID_B, { name: "Alex", colorIndex: 5 })],
    items: [
      makeItem("x1", 1250, { [UUID_A]: 1, [UUID_B]: 2 }, { name: "Al pastor", quantity: 3 }),
      makeItem("x2", 0, {}, { name: "Salsa" }),
    ],
    adjustments: [
      makeAdjustment("t", "tax", percent(825)),
      makeAdjustment("tip", "tip", percent(2000), { basis: "posttax", split: "equal" }),
      makeAdjustment("d", "discount", amount(300), { label: "Happy hour" }),
    ],
    printed: { totalCents: 1600 },
    paidBy: UUID_A,
    settled: [UUID_B],
    notes: "Thanks!",
  });
}

describe("toSnapshot", () => {
  it("drops SyncFields and keeps the rest", () => {
    const bill = sampleBill();
    const snap = toSnapshot(bill);
    expect(snap).not.toHaveProperty("id");
    expect(snap).not.toHaveProperty("createdAt");
    expect(snap).not.toHaveProperty("updatedAt");
    expect(snap).not.toHaveProperty("deletedAt");
    const rest: Partial<Bill> = { ...bill };
    for (const k of ["id", "createdAt", "updatedAt", "deletedAt"] as const) delete rest[k];
    expect(snap).toEqual(rest);
  });

  it("does not share structure with the bill", () => {
    const bill = sampleBill();
    const snap = toSnapshot(bill);
    snap.items[0].claims[UUID_A] = 9;
    snap.settled.push("x");
    expect(bill.items[0].claims[UUID_A]).toBe(1);
    expect(bill.settled).toEqual([UUID_B]);
  });
});

describe("encodeShare / decodeShare", () => {
  it("round-trips a hand-built bill, minting positional ids", async () => {
    const bill = sampleBill();
    const payload = await encodeShare(bill);
    expect(payload.startsWith(`${SHARE_VERSION}.`)).toBe(true);
    const decoded = await decodeShare(payload);
    expect(decoded).toEqual(byPosition(toSnapshot(bill)));
    expect(decoded.people.map((p) => p.id)).toEqual(["0", "1"]);
    expect(decoded.paidBy).toBe("0");
    expect(decoded.items[0].claims).toEqual({ "0": 1, "1": 2 });
    expect(JSON.stringify(decoded)).not.toContain(UUID_A);
  });

  it("accepts a snapshot as well as a bill, and a leading #", async () => {
    const bill = sampleBill();
    const payload = await encodeShare(toSnapshot(bill));
    expect(payload).toBe(await encodeShare(bill));
    expect(await decodeShare(`#${payload}`)).toEqual(await decodeShare(payload));
  });

  it("keeps an empty bill and an absent notes field", async () => {
    const bill = makeBill();
    const decoded = await decodeShare(await encodeShare(bill));
    expect(decoded).toEqual(toSnapshot(bill));
    expect(decoded).not.toHaveProperty("notes");
  });

  it("carries non-ASCII names intact", async () => {
    const bill = makeBill({
      title: "Ramen 🍜 — Shibuya",
      currency: "JPY",
      people: [makePerson("a", { name: "Zoë" }), makePerson("b", { name: "田中" })],
      items: [makeItem("i", 1200, { a: 1, b: 1 }, { name: "Tonkotsu ラーメン" })],
    });
    expect(await decodeShare(await encodeShare(bill))).toEqual(byPosition(toSnapshot(bill)));
  });

  it("emits base64url only: no +, /, = or other fragment-unsafe characters", async () => {
    const rand = mulberry32(propertySeed() + 7);
    for (let n = 0; n < 100; n++) {
      const payload = await encodeShare(randomBill(rand));
      expect(payload).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    }
  });

  it("refuses to encode a claim by a person not on the bill", async () => {
    const bill = makeBill({ people: [makePerson("a")], items: [makeItem("i", 100, { ghost: 1 })] });
    await expect(encodeShare(bill)).rejects.toThrow(/unknown person/);
  });

  it("round-trips 500 random bills (seeded), modulo ids", async () => {
    const seed = propertySeed();
    const rand = mulberry32(seed + 13);
    for (let n = 0; n < 500; n++) {
      const bill = randomBill(rand);
      try {
        expect(await decodeShare(await encodeShare(bill))).toEqual(byPosition(toSnapshot(bill)));
      } catch (err) {
        if (err instanceof Error) {
          err.message = `${err.message}\n  ↳ random bill #${n}, reproduce with PROPERTY_SEED=${seed}: ${JSON.stringify(bill)}`;
        }
        throw err;
      }
    }
  });
});

describe("size budget", () => {
  it("a 40-item, 8-person bill with realistic names encodes to < 2,000 characters", async () => {
    const names = ["Alejandra", "Benjamin", "Charlotte", "Dmitri", "Esperanza", "Fitzgerald", "Guadalupe", "Hiroshi"];
    const dishes = [
      "Margherita pizza", "Burrata with heirloom tomatoes", "Caesar salad", "Truffle fries", "Spicy tuna roll",
      "Chicken tikka masala", "Garlic naan", "Pad see ew", "Green papaya salad", "Shrimp tempura",
      "Duck confit", "Steak frites (medium rare)", "Mushroom risotto", "Lobster bisque", "Fish tacos",
      "Carne asada burrito", "Elote", "Guacamole & chips", "Korean fried chicken", "Kimchi pancake",
      "Bibimbap", "Pho tai", "Banh mi", "Spring rolls", "Lamb gyro plate",
      "Falafel wrap", "Hummus trio", "Baklava", "Tiramisu", "Crème brûlée",
      "Negroni", "Aperol spritz", "Old fashioned", "Hazy IPA (pint)", "House red (bottle)",
      "Prosecco (glass)", "Sparkling water", "Matcha latte", "Espresso martini", "Mango lassi",
    ];
    const rand = mulberry32(propertySeed() + 99);
    const people = names.map((name, i) => makePerson(crypto.randomUUID(), { name, colorIndex: i }));
    const items = dishes.map((name) => {
      const claims: Record<string, number> = {};
      for (const p of people) if (rand() < 0.35) claims[p.id] = rand() < 0.85 ? 1 : randInt(rand, 2, 4);
      if (Object.keys(claims).length === 0) claims[people[randInt(rand, 0, 7)].id] = 1;
      return makeItem(crypto.randomUUID(), randInt(rand, 300, 6500), claims, { name, quantity: randInt(rand, 1, 3) });
    });
    const bill = makeBill({
      title: "Birthday dinner at Osteria",
      people,
      items,
      adjustments: [
        makeAdjustment(crypto.randomUUID(), "tax", percent(887)),
        makeAdjustment(crypto.randomUUID(), "tip", percent(2000)),
        makeAdjustment(crypto.randomUUID(), "fee", percent(300), { label: "Service charge" }),
      ],
      printed: { subtotalCents: 98765, totalCents: 128399 },
      paidBy: people[0].id,
      settled: [people[1].id, people[2].id],
    });
    const payload = await encodeShare(bill);
    expect(payload.length).toBeLessThan(2000);
    expect(await decodeShare(payload)).toEqual(byPosition(toSnapshot(bill)));
  });
});

describe("decode errors", () => {
  const validCompact = (): unknown[] => [
    "Tacos", "2026-11-25", "USD",
    [["Sam", 0], ["Alex", 1]],
    [["Taco", 1, 500, [0, 1, 1, 2]]],
    [[0, "Tax", 1, 825, 0, 0]],
    [null, null],
    0,
    [1],
  ];

  it("forge() itself produces decodable payloads", async () => {
    const decoded = await decodeShare(await forge(validCompact()));
    expect(decoded.items[0].claims).toEqual({ "0": 1, "1": 2 });
  });

  it("an unknown version → version", async () => {
    expect(await reasonOf(await forge(validCompact(), "2"))).toBe("version");
    expect(await reasonOf("0.abc")).toBe("version");
    expect(await reasonOf("99.")).toBe("version");
  });

  it("bad base64 or deflate → corrupt", async () => {
    expect(await reasonOf("1.not*base64!")).toBe("corrupt");
    expect(await reasonOf("1.a+b/c=")).toBe("corrupt");
    expect(await reasonOf("1.A")).toBe("corrupt"); // impossible base64 length
    expect(await reasonOf("1.AAECAwQFBgcICQ")).toBe("corrupt"); // valid base64, not deflate
    expect(await reasonOf("1.")).toBe("corrupt");
    const good = await forge(validCompact());
    expect(await reasonOf(good.slice(0, good.length - 6))).toBe("corrupt"); // truncated
    expect(await reasonOf("")).toBe("corrupt");
    expect(await reasonOf("no-version-prefix")).toBe("corrupt");
  });

  it("deflated non-JSON → corrupt", async () => {
    const stream = new Blob(["{not json"]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(await reasonOf(`1.${Buffer.from(bytes).toString("base64url")}`)).toBe("corrupt");
  });

  it("an oversized inflated payload → corrupt (no decompression bomb)", async () => {
    expect(await reasonOf(await forge(["x".repeat(2_000_000)]))).toBe("corrupt");
  });

  it("a schema failure → invalid", async () => {
    const cases: ((c: unknown[]) => void)[] = [
      (c) => (c[0] = ""), // empty title
      (c) => (c[1] = "2026-02-30"), // not a real date
      (c) => (c[2] = "US$"), // malformed currency
      (c) => ((c[4] as unknown[][])[0][2] = -1), // negative price
      (c) => ((c[4] as unknown[][])[0][2] = 1.5), // float money
      (c) => ((c[4] as unknown[][])[0][3] = [0, 0]), // 0 shares
      (c) => ((c[4] as unknown[][])[0][3] = [0, 1, 0, 1]), // duplicate claim
      (c) => ((c[4] as unknown[][])[0][3] = [0]), // odd claims array
      (c) => (c[5] = [[0, "Tax", 1, 825, 0, 0], [0, "Tax 2", 1, 100, 0, 0]]), // two taxes
      (c) => (c[5] = [[0, "Tax", 1, 825, 0, 1]]), // basis on a non-tip
      (c) => (c[5] = [[7, "Tax", 1, 825, 0, 0]]), // unknown kind
      (c) => ((c[3] as unknown[][])[0][1] = 8), // colorIndex out of range
      (c) => (c[8] = [1, 1]), // settled twice
      (c) => c.splice(3, 1), // missing field
      (c) => c.push("notes", "extra"), // too many fields
      (c) => (c[9] = 42), // notes not a string
    ];
    for (const [i, mutate] of cases.entries()) {
      const c = validCompact();
      mutate(c);
      expect(await reasonOf(await forge(c)), `case ${i}`).toBe("invalid");
    }
    expect(await reasonOf(await forge({ title: "Tacos" }))).toBe("invalid");
    expect(await reasonOf(await forge(null))).toBe("invalid");
  });

  it("a person index out of range → invalid", async () => {
    const cases: ((c: unknown[]) => void)[] = [
      (c) => ((c[4] as unknown[][])[0][3] = [2, 1]), // claim past the end
      (c) => ((c[4] as unknown[][])[0][3] = [-1, 1]), // negative claim index
      (c) => (c[7] = 5), // payer past the end
      (c) => (c[8] = [2]), // settled past the end
    ];
    for (const [i, mutate] of cases.entries()) {
      const c = validCompact();
      mutate(c);
      expect(await reasonOf(await forge(c)), `case ${i}`).toBe("invalid");
    }
  });

  it("ShareDecodeError carries a reason and a user-facing message", async () => {
    const err = await decodeShare("9.x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShareDecodeError);
    expect(err).toBeInstanceOf(Error);
    expect((err as ShareDecodeError).reason).toBe("version");
    expect((err as ShareDecodeError).message).toMatch(/newer version/);
  });
});

describe("payment handles (#30)", () => {
  // Encoded by main's lib/share.ts before #30 (Sam + Alex, one shared $25 item, Sam paid).
  // It must decode forever: handles are an optional trailing person element.
  const PRE_30_LINK = "1.FYsxCoAwEAT_svUGLpHYC9Y20eq4IgTBImohgs-XY2GKGVax1nY_IJKkMcQYUgaxlRlURaknOBgVU98_MJu5Xmo7_BSZsghVGH3m1ajX2zsdRqGa_Q";

  it("a link made before handles existed still decodes, with no handles", async () => {
    const snap = await decodeShare(PRE_30_LINK);
    expect(snap.people).toEqual([
      { id: "0", name: "Sam", colorIndex: 3 },
      { id: "1", name: "Alex", colorIndex: 5 },
    ]);
    expect(snap.items[0]).toMatchObject({ name: "Nachos", priceCents: 2500, claims: { "0": 1, "1": 1 } });
    expect(snap.paidBy).toBe("0");
  });

  it("a bill without handles still encodes byte-for-byte as before", async () => {
    const bill = makeBill({
      title: "Tacos", date: "2026-11-25", currency: "USD",
      people: [makePerson("a", { name: "Sam", colorIndex: 3 }), makePerson("b", { name: "Alex", colorIndex: 5 })],
      items: [makeItem("x", 2500, { a: 1, b: 1 }, { name: "Nachos" })], paidBy: "a", settled: [],
    });
    expect(await encodeShare(bill)).toBe(PRE_30_LINK);
  });

  it("round-trips handles, partial or full, still as a v1 link", async () => {
    const bill = sampleBill();
    bill.people[0].handles = { venmo: "sam-lee", cashtag: "samlee", paypal: "SamLee" };
    bill.people[1].handles = { cashtag: "alex" };
    const payload = await encodeShare(bill);
    expect(payload.startsWith("1.")).toBe(true);
    const snap = await decodeShare(payload);
    expect(snap.people[0].handles).toEqual({ venmo: "sam-lee", cashtag: "samlee", paypal: "SamLee" });
    expect(snap.people[1].handles).toEqual({ cashtag: "alex" });
  });

  it("toSnapshot copies handles rather than sharing them", () => {
    const bill = sampleBill();
    bill.people[0].handles = { venmo: "sam-lee" };
    const snap = toSnapshot(bill);
    snap.people[0].handles!.venmo = "changed";
    expect(bill.people[0].handles?.venmo).toBe("sam-lee");
  });

  it("an invalid handle in a link → invalid", async () => {
    const bill = sampleBill();
    bill.people[0].handles = { venmo: "a/b?evil" };
    await expect(decodeShare(await encodeShare(bill))).rejects.toMatchObject({ reason: "invalid" });
  });
});

describe("shareUrl", () => {
  it("puts the payload in the fragment of /s", () => {
    expect(shareUrl("https://split-it.app", "1.abc")).toBe("https://split-it.app/s#1.abc");
    expect(shareUrl("http://localhost:3000/", "1.abc")).toBe("http://localhost:3000/s#1.abc");
    const url = new URL(shareUrl("https://split-it.app", "1.a-b_c"));
    expect(url.search).toBe("");
    expect(url.hash).toBe("#1.a-b_c");
  });
});
