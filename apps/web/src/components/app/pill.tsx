/** The landing's label: a white pill lifted on a soft shadow, as in the readers section. */
export const raised = "bg-white shadow-[0_1px_0_rgba(0,0,0,.06),0_4px_12px_-4px_rgba(0,0,0,.18)]";

/**
 * Saturated landing colors for small icons and dots on white, each at least 3:1 against it.
 * Sun's yellow is too pale for that, so its icons use the landing's terra.
 */
export const ink = {
  grass: "#23944c",
  sun: "#e0602f",
  sky: "#1677c9",
  rose: "#ff4f8b",
  violet: "#7c4ddb",
} as const;
