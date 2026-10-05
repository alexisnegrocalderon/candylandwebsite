import { describe, expect, it } from "vitest";
import {
  getRpIdAndOrigin, buildRegistrationOptions, buildAuthenticationOptions, PRODUCTION_RP_ID,
  ADMIN_WEBAUTHN_USER_ID_B64URL, ADMIN_WEBAUTHN_USER_NAME,
} from "./webauthn";

const req = (origin?: string, host = "mansionplayroom.cl") => ({ headers: { origin, host } });

describe("getRpIdAndOrigin", () => {
  it("fija el rpID de producción para el apex y para www", () => {
    expect(getRpIdAndOrigin(req("https://mansionplayroom.cl")).rpID).toBe(PRODUCTION_RP_ID);
    expect(getRpIdAndOrigin(req("https://www.mansionplayroom.cl")).rpID).toBe(PRODUCTION_RP_ID);
  });
  it("mantiene el origin real del navegador", () => {
    expect(getRpIdAndOrigin(req("https://www.mansionplayroom.cl")).origin).toBe("https://www.mansionplayroom.cl");
  });
  it("en previews y localhost usa el hostname real", () => {
    expect(getRpIdAndOrigin(req("https://candylandwebsite-git-x.vercel.app")).rpID).toBe("candylandwebsite-git-x.vercel.app");
    expect(getRpIdAndOrigin(req("http://localhost:3000")).rpID).toBe("localhost");
  });
  it("sin header origin se deduce del host", () => {
    expect(getRpIdAndOrigin(req(undefined, "mansionplayroom.cl"))).toEqual({ rpID: PRODUCTION_RP_ID, origin: "https://mansionplayroom.cl" });
  });
  it("no confunde dominios parecidos", () => {
    expect(getRpIdAndOrigin(req("https://evilmansionplayroom.cl")).rpID).toBe("evilmansionplayroom.cl");
  });
});

describe("buildRegistrationOptions", () => {
  it("usa el MISMO user.id en cada registro (una sola identidad en el llavero)", async () => {
    const a = await buildRegistrationOptions({ rpID: PRODUCTION_RP_ID, existingCredentialIds: [] });
    const b = await buildRegistrationOptions({ rpID: PRODUCTION_RP_ID, existingCredentialIds: ["abc"] });
    expect(a.user.id).toBe(ADMIN_WEBAUTHN_USER_ID_B64URL);
    expect(b.user.id).toBe(a.user.id);
    expect(a.user.name).toBe(ADMIN_WEBAUTHN_USER_NAME);
    expect(a.challenge).not.toBe(b.challenge);
  });
  it("exige llave residente con verificación del usuario", async () => {
    const o = await buildRegistrationOptions({ rpID: PRODUCTION_RP_ID, existingCredentialIds: [] });
    expect(o.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" });
  });
});

describe("buildAuthenticationOptions", () => {
  it("pide verificación del usuario y no limita las credenciales", async () => {
    const o = await buildAuthenticationOptions({ rpID: PRODUCTION_RP_ID });
    expect(o.rpId).toBe(PRODUCTION_RP_ID);
    expect(o.userVerification).toBe("required");
  });
});
