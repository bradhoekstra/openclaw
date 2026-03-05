import {
  createAccountStatusSink,
  runPassiveAccountLifecycle,
} from "openclaw/plugin-sdk/channel-lifecycle";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import { createLazyRuntimeNamedExport } from "openclaw/plugin-sdk/lazy-runtime";
import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/status-helpers";
import type { ResolvedGoogleChatAccount } from "./accounts.js";
import type { GoogleChatRuntimeEnv } from "./monitor-types.js";

const loadGoogleChatChannelRuntime = createLazyRuntimeNamedExport(
  () => import("./channel.runtime.js"),
  "googleChatChannelRuntime",
);

export async function startGoogleChatGatewayAccount(ctx: {
  account: ResolvedGoogleChatAccount;
  cfg: OpenClawConfig;
  runtime: GoogleChatRuntimeEnv;
  abortSignal: AbortSignal;
  setStatus: (next: ChannelAccountSnapshot) => void;
  log?: {
    info?: (message: string) => void;
  };
}): Promise<void> {
  const account = ctx.account;
  const statusSink = createAccountStatusSink({
    accountId: account.accountId,
    setStatus: ctx.setStatus,
  });
  const isPubSub = Boolean(account.config.pubsubSubscription);
  const modeLabel = isPubSub ? "Pub/Sub" : "webhook";
  ctx.log?.info?.(`[${account.accountId}] starting Google Chat ${modeLabel}`);
  const { resolveGoogleChatWebhookPath, startGoogleChatMonitor } =
    await loadGoogleChatChannelRuntime();
  statusSink({
    running: true,
    lastStartAt: Date.now(),
    ...(isPubSub
      ? { pubsubSubscription: account.config.pubsubSubscription }
      : { webhookPath: resolveGoogleChatWebhookPath({ account }) }),
    audienceType: account.config.audienceType,
    audience: account.config.audience,
  });
  await runPassiveAccountLifecycle({
    abortSignal: ctx.abortSignal,
    start: async () =>
      await startGoogleChatMonitor({
        account,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        webhookPath: account.config.webhookPath,
        webhookUrl: account.config.webhookUrl,
        pubsubSubscription: account.config.pubsubSubscription,
        pubsubMaxMessages: account.config.pubsubMaxMessages,
        statusSink,
      }),
    stop: async (unregister) => {
      unregister?.();
    },
    onStop: async () => {
      statusSink({
        running: false,
        lastStopAt: Date.now(),
      });
    },
  });
}
