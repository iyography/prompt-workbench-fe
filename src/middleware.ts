// Code taken directly from this guide on setting up authentication for NextJS + Django Rest
// See: https://dev.to/koladev/fullstack-nextjs-django-authentication-django-rest-typescript-jwt-wretch-djoser-2pcf

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

export async function middleware(request: NextRequest) {
  // Checks that the user has an access token, and if not, redirects to the login page.
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken");
  if (!accessToken && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!api|auth|_next/static|_next/image|.*\\.png$).*)"],
};
