import type { Request } from "express";

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthenticatedRequest = Request & {
  user: PublicUser;
  sessionId: string;
};

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
};

export type RefreshTokenPayload = AccessTokenPayload & {
  jti: string;
};
