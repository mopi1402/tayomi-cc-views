import { describe, it, expect } from "vitest";
import { displayWidth, clusterWidth, clusterMap } from "./width.js";

// The numbers below are the ones a terminal actually prints, and they are what every frame in a view is padded against.
// Each case is a way `.length` lies.
describe("displayWidth", () => {
  it("measures ASCII as one column per character", () => {
    expect(displayWidth("done in 3 files")).toBe(15);
  });

  it("counts an ideograph as two columns, where .length counts one", () => {
    expect("你好世界".length).toBe(4);
    expect(displayWidth("你好世界")).toBe(8);
  });

  it("counts a fullwidth form and the ideographic space as two columns", () => {
    expect(displayWidth("Ｗ")).toBe(2);
    expect(displayWidth("　")).toBe(2);
  });

  it("counts a default-presentation emoji as two columns from one code unit", () => {
    expect("✅".length).toBe(1);
    expect(displayWidth("✅")).toBe(2);
  });

  it("leaves a text-presentation symbol at one column", () => {
    // The half of the "emoji" set that is NOT wide: these print in the text style unless a variation selector asks
    // otherwise, so widening them would rag the frame the other way.
    expect(displayWidth("✔")).toBe(1);
    expect(displayWidth("⚠")).toBe(1);
    expect(displayWidth("★")).toBe(1);
    expect(displayWidth("▎")).toBe(1);
    expect(displayWidth("─")).toBe(1);
  });

  it("counts a text-presentation symbol as two columns once VS16 asks for emoji", () => {
    const warn = "⚠" + String.fromCharCode(0xfe0f);
    expect(warn.length).toBe(2);
    expect(displayWidth(warn)).toBe(2);
  });

  it("counts a surrogate pair as two columns (the case that came out right by luck)", () => {
    expect("🟥".length).toBe(2);
    expect(displayWidth("🟥")).toBe(2);
  });

  it("counts a ZWJ sequence as two columns, where .length counts five or more", () => {
    expect("👨‍💻".length).toBe(5);
    expect(displayWidth("👨‍💻")).toBe(2);
    expect("🏳️‍🌈".length).toBe(6);
    expect(displayWidth("🏳️‍🌈")).toBe(2);
  });

  it("counts a combining mark as nothing on top of its base", () => {
    const composed = "e" + String.fromCharCode(0x301);
    expect(composed.length).toBe(2);
    expect(displayWidth(composed)).toBe(1);
    expect(displayWidth("é")).toBe(1);
  });

  it("counts a C0 control as nothing, so a stray marker costs no column", () => {
    expect(displayWidth(String.fromCharCode(2))).toBe(0);
    expect(displayWidth("a" + String.fromCharCode(0) + "b")).toBe(2);
  });

  it("measures a mixed line as the sum of its clusters", () => {
    // 4 ASCII + space + 2 ideographs at 2 + space + emoji at 2, the frame arithmetic in miniature: 12 columns for 9
    // code units.
    expect("spec 仕様 ✅".length).toBe(9);
    expect(displayWidth("spec 仕様 ✅")).toBe(12);
  });
});

describe("clusterWidth", () => {
  it("is zero for an empty cluster, so the walk never returns NaN", () => {
    expect(clusterWidth("")).toBe(0);
  });
});

describe("clusterMap", () => {
  it("keys every cluster by its start offset, joined sequences included", () => {
    const m = clusterMap("a你👨‍💻b");
    expect([...m.keys()]).toEqual([0, 1, 2, 7]);
    expect(m.get(2)).toBe("👨‍💻");
    expect([...m.values()].join("")).toBe("a你👨‍💻b");
  });
});
