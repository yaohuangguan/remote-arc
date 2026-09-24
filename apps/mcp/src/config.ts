export type RemoteArcMode = "safe" | "developer" | "full";

const parseMode = (value: string | undefined): RemoteArcMode => {
  if (value === "developer" || value === "full") return value;
  return "safe";
};

export const config = {
  mode: parseMode(process.env.REMOTE_LINK_MODE),
  desktopCommanderCommand:
    process.env.REMOTE_LINK_DESKTOP_COMMANDER_COMMAND || "npx",
  desktopCommanderPackage:
    process.env.REMOTE_LINK_DESKTOP_COMMANDER_PACKAGE ||
    "@wonderwhy-er/desktop-commander@latest",
  allowGenericCoreCall:
    process.env.REMOTE_LINK_ALLOW_CORE_CALL === "1",
} as const;

export const isDeveloperMode = () =>
  config.mode === "developer" || config.mode === "full";

export const isFullMode = () => config.mode === "full";
