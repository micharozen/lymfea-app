import { describe, expect, it } from "vitest";
import { channelToBookingSource } from "./taskChannel";

describe("channelToBookingSource", () => {
  it("mappe les canaux qui ont un équivalent dans bookings.source", () => {
    expect(channelToBookingSource("phone")).toBe("phone");
    expect(channelToBookingSource("email")).toBe("email");
    expect(channelToBookingSource("website")).toBe("client");
  });

  it("retombe sur admin pour les canaux sans équivalent", () => {
    expect(channelToBookingSource("whatsapp")).toBe("admin");
    expect(channelToBookingSource("instagram")).toBe("admin");
    expect(channelToBookingSource("walk_in")).toBe("admin");
    expect(channelToBookingSource("partner")).toBe("admin");
    expect(channelToBookingSource("other")).toBe("admin");
  });

  it("retombe sur admin quand le canal n'est pas renseigné", () => {
    expect(channelToBookingSource(null)).toBe("admin");
    expect(channelToBookingSource(undefined)).toBe("admin");
  });
});
