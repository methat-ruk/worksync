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
};

export type AccessTokenPayload = {
  sub: string;
  iat: number;
  exp: number;
};

