import { PasswordHasher } from "../../src/auth/password-hasher.service";

describe("PasswordHasher", () => {
  const hasher = new PasswordHasher();

  it("encodes the versioned scrypt parameters and verifies the password", async () => {
    const hash = await hasher.hash("correct horse battery staple");

    expect(hash).toMatch(/^scrypt\$v=1\$N=32768,r=8,p=3\$/);
    await expect(
      hasher.verify("correct horse battery staple", hash)
    ).resolves.toBe(true);
    await expect(hasher.verify("incorrect password", hash)).resolves.toBe(
      false
    );
  });

  it("rejects malformed or unsupported hashes without throwing", async () => {
    await expect(hasher.verify("password", "not-a-hash")).resolves.toBe(false);
    await expect(
      hasher.verify(
        "password",
        "scrypt$v=2$N=32768,r=8,p=3$c2FsdHNhbHRzYWx0c2FsdA$a2V5"
      )
    ).resolves.toBe(false);
  });

  it("performs dummy verification when no credential hash exists", async () => {
    await expect(
      hasher.verifyWithDummy("attempted password", null)
    ).resolves.toBe(false);
  });
});

