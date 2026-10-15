import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentLinkSigner } from "../domain/ports";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class HmacPaymentLinkSigner implements PaymentLinkSigner {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32)
      throw new Error("PAYMENT_LINK_SIGNING_SECRET must be at least 32 bytes");
  }

  issue(linkId: string) {
    if (!UUID_V4.test(linkId)) throw new Error("Invalid payment link id");
    const payload = `pl1:${linkId}`;
    const mac = createHmac("sha256", this.secret)
      .update(payload)
      .digest("base64url");
    return `pl1.${linkId}.${mac}`;
  }

  verify(token: string) {
    if (typeof token !== "string" || token.length !== 84) return null;
    const match = /^pl1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!match || !UUID_V4.test(match[1])) return null;
    const expected = createHmac("sha256", this.secret)
      .update(`pl1:${match[1]}`)
      .digest();
    let actual: Buffer;
    try {
      actual = Buffer.from(match[2], "base64url");
    } catch {
      return null;
    }
    if (actual.toString("base64url") !== match[2]) return null;
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    return match[1];
  }
}
