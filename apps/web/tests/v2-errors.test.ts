import { describe, expect, test } from "bun:test";
import { ApiError } from "../src/lib/api";
import { friendlyError, isNetworkError } from "../src/lib/errors";

describe("friendlyError", () => {
  test("a request that never reached the server retries", () => {
    for (const message of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
    ]) {
      expect(isNetworkError(new TypeError(message))).toBe(true);
      expect(friendlyError(new TypeError(message))).toEqual({
        message: "can't reach the server. retrying.",
        retry: true,
      });
    }
    expect(friendlyError(new TypeError("Failed to fetch"), { auto: false }).message).toBe(
      "can't reach the server. check your connection and try again.",
    );
    // A bug is not a network failure.
    expect(isNetworkError(new TypeError("x is not a function"))).toBe(false);
  });

  test("a signed-out session keeps the writing and asks to log in", () => {
    expect(friendlyError(new ApiError("Please sign in", 401, "unauthorized"))).toEqual({
      message: "you're signed out. log in again; your writing is kept in this browser.",
      retry: false,
    });
    // A wrong password at login is the server's own words, not a signed-out session.
    expect(
      friendlyError(new ApiError("Invalid email or password", 401, "invalid_credentials")).message,
    ).toBe("invalid email or password");
  });

  test("too large, an older server, rate limits and server failures", () => {
    expect(
      friendlyError(new ApiError("This request is too large to save", 413, "too_large")),
    ).toEqual({
      message: "this page is too large to save. try splitting it into two pages.",
      retry: false,
    });
    expect(
      friendlyError(
        new ApiError(
          'The server does not accept the field "tags". It may be older than the app; restart it and try again',
          400,
          "unknown_field",
        ),
      ),
    ).toEqual({
      message: "the server is older than this app. restart the API, then retry.",
      retry: false,
    });
    expect(
      friendlyError(new ApiError("Too many requests; try again shortly", 429, "rate_limit")),
    ).toEqual({
      message: "too many requests in a row. trying again in a moment.",
      retry: true,
    });
    // Without a retry of its own, a caller shows the server's specific wait.
    expect(
      friendlyError(new ApiError("Too many exports; try later", 429, "rate_limit"), { auto: false })
        .message,
    ).toBe("too many exports; try later");
    expect(friendlyError(new ApiError("Unable to complete request", 500, "internal"))).toEqual({
      message: "the server had a problem. retrying.",
      retry: true,
    });
    expect(friendlyError(new ApiError("Something went wrong. Please try again.", 502))).toEqual({
      message: "the server had a problem. retrying.",
      retry: true,
    });
    expect(friendlyError(new ApiError("Database unavailable", 503, "unavailable")).retry).toBe(
      true,
    );
    // A feature that isn't set up says so; retrying won't help.
    expect(
      friendlyError(new ApiError("Image storage is not configured", 503, "storage_unavailable")),
    ).toEqual({ message: "image storage is not configured", retry: false });
  });

  test("other refusals show the server's message in the app's voice", () => {
    expect(friendlyError(new ApiError("Title is too long", 400, "validation"))).toEqual({
      message: "title is too long",
      retry: false,
    });
    expect(
      friendlyError(new ApiError('The field "title" has the wrong type', 400, "invalid_request"))
        .message,
    ).toBe('the field "title" has the wrong type');
    expect(
      friendlyError(new ApiError("Comments are turned off for this post", 403, "comments_off"))
        .message,
    ).toBe("comments are turned off for this post");
    expect(friendlyError(new ApiError("A newer draft exists", 409, "revision_conflict"))).toEqual({
      message: "a newer draft exists",
      retry: false,
    });
    // Capitals that carry meaning stay.
    expect(friendlyError(new ApiError("AI limit reached; try again in an hour", 400)).message).toBe(
      "AI limit reached; try again in an hour",
    );
    expect(friendlyError(new Error("markdown imports must be smaller than 1 MB.")).message).toBe(
      "markdown imports must be smaller than 1 MB.",
    );
    expect(friendlyError("nope")).toEqual({
      message: "something went wrong. try again.",
      retry: false,
    });
  });
});
