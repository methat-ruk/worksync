"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

import { googleLoginUrl, googleOAuthEnabled } from "../api-client";
import { GoogleIcon } from "./google-icon";

export function GoogleButton() {
  const button = (
    <Button
      className="h-10 w-full"
      variant="outline"
      disabled={!googleOAuthEnabled}
      onClick={() => {
        window.location.assign(googleLoginUrl());
      }}
      type="button"
    >
      <GoogleIcon />
      Continue with Google
    </Button>
  );

  if (googleOAuthEnabled) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block w-full" />}>
        {button}
      </TooltipTrigger>
      <TooltipContent>Google sign-in is coming soon.</TooltipContent>
    </Tooltip>
  );
}
