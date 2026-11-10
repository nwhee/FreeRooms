import { describe, expect, it } from "vitest";
import { CAMPUSES, campusFromBannerName } from "./campuses";

const byCode = (code: string) => CAMPUSES.find((campus) => campus.code === code);

describe("CAMPUSES (FR-1 AC8)", () => {
  it("lists exactly the 17 rooms-capable campuses from the research table", () => {
    expect(CAMPUSES.map((campus) => campus.code)).toEqual([
      "BOS", "BRD", "BRL", "DDH", "NAH", "PTL", "NYC", "ARL", "CHL",
      "MIA", "TOR", "LDN", "OAK", "SFR", "SJO", "SEA", "VAN",
    ]);
  });

  it("has a timezone accepted by Intl.DateTimeFormat for every campus", () => {
    for (const campus of CAMPUSES) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: campus.timezone })).not.toThrow();
    }
  });

  it("puts TOR and VAN in CAN, LDN in UK and the rest in USA", () => {
    expect(byCode("TOR")?.region).toBe("CAN");
    expect(byCode("VAN")?.region).toBe("CAN");
    expect(byCode("LDN")?.region).toBe("UK");
    const others = CAMPUSES.filter((campus) => !["TOR", "VAN", "LDN"].includes(campus.code));
    expect(new Set(others.map((campus) => campus.region))).toEqual(new Set(["USA"]));
  });

  it("puts the West Coast US campuses in America/Los_Angeles", () => {
    for (const code of ["OAK", "SFR", "SJO", "SEA"]) {
      expect(byCode(code)?.timezone).toBe("America/Los_Angeles");
    }
  });

  it("uses each campus's own zone for London, Toronto and Vancouver", () => {
    expect(byCode("LDN")?.timezone).toBe("Europe/London");
    expect(byCode("TOR")?.timezone).toBe("America/Toronto");
    expect(byCode("VAN")?.timezone).toBe("America/Vancouver");
  });

  it("gives every campus a name and at least one Banner name", () => {
    for (const campus of CAMPUSES) {
      expect(campus.name).not.toBe("");
      expect(campus.bannerNames.length).toBeGreaterThan(0);
    }
  });
});

describe("campusFromBannerName (FR-1 AC9)", () => {
  it.each([
    ["Boston", "BOS"],
    ["Portland, Maine", "PTL"],
    ["Portland Maine", "PTL"],
    ["Oakland CA", "OAK"],
    ["Toronto Canada", "TOR"],
    ["Silicon Valley CA", "SJO"],
    ["Boston - Broad Street", "BRD"],
    ["London", "LDN"],
  ])("maps %j to %s", (name, code) => {
    expect(campusFromBannerName(name)?.code).toBe(code);
  });

  it("ignores case, punctuation and extra spaces", () => {
    expect(campusFromBannerName("  NEW   york,ny ")?.code).toBe("NYC");
    expect(campusFromBannerName("portland,   MAINE.")?.code).toBe("PTL");
    expect(campusFromBannerName("boston-broad street")?.code).toBe("BRD");
  });

  it("finds every campus by every one of its Banner names", () => {
    for (const campus of CAMPUSES) {
      for (const bannerName of campus.bannerNames) {
        expect(campusFromBannerName(bannerName)).toBe(campus);
      }
    }
  });

  it.each(["Online", "Online Contingency", "No campus, no room needed", "Atlantis", "", "BOS"])(
    "returns null for %j",
    (name) => {
      expect(campusFromBannerName(name)).toBeNull();
    },
  );
});
