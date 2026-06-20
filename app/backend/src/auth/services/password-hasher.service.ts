import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";

import { Injectable } from "@nestjs/common";

const HASH_VERSION = 1;
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_MEMORY = 64 * 1024 * 1024;
const HASH_PATTERN =
  /^scrypt\$v=(\d+)\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

type ParsedHash = {
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  key: Buffer;
};

function parseHash(encodedHash: string): ParsedHash | undefined {
  const match = HASH_PATTERN.exec(encodedHash);
  if (!match) {
    return undefined;
  }

  const version = Number(match[1]);
  const cost = Number(match[2]);
  const blockSize = Number(match[3]);
  const parallelization = Number(match[4]);
  if (
    version !== HASH_VERSION ||
    cost !== COST ||
    blockSize !== BLOCK_SIZE ||
    parallelization !== PARALLELIZATION
  ) {
    return undefined;
  }

  const salt = Buffer.from(match[5] ?? "", "base64url");
  const key = Buffer.from(match[6] ?? "", "base64url");
  if (salt.length < SALT_BYTES || key.length !== KEY_BYTES) {
    return undefined;
  }

  return { cost, blockSize, parallelization, salt, key };
}

async function deriveKey(
  password: string,
  salt: Buffer,
  cost = COST,
  blockSize = BLOCK_SIZE,
  parallelization = PARALLELIZATION
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_BYTES,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: MAX_MEMORY
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

@Injectable()
export class PasswordHasher {
  private readonly dummyHash: Promise<string>;

  constructor() {
    this.dummyHash = this.hash("WorkSync dummy credential value");
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(password, salt);
    return [
      "scrypt",
      `v=${HASH_VERSION}`,
      `N=${COST},r=${BLOCK_SIZE},p=${PARALLELIZATION}`,
      salt.toString("base64url"),
      key.toString("base64url")
    ].join("$");
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = parseHash(encodedHash);
    if (!parsed) {
      return false;
    }

    const candidate = await deriveKey(
      password,
      parsed.salt,
      parsed.cost,
      parsed.blockSize,
      parsed.parallelization
    );
    return timingSafeEqual(candidate, parsed.key);
  }

  async verifyWithDummy(
    password: string,
    encodedHash: string | null | undefined
  ): Promise<boolean> {
    const hash = encodedHash ?? (await this.dummyHash);
    const valid = await this.verify(password, hash);
    return Boolean(encodedHash) && valid;
  }
}
