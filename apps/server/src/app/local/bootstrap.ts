import { randomBytes } from "node:crypto";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { instanceSettings, user, workspace } from "../../infrastructure/database/schema";
import { createAuth } from "../../features/auth/auth";
import { bootstrapSelfHostedInstance, getInstanceAdministrationSettings } from "../../features/instance/registration";

export async function openLocalSession(input: { installationId: string; name?: string; workspaceName?: string }) {
  const name = (input.name ?? "Me").trim();
  const workspaceName = (input.workspaceName ?? "My workspace").trim();
  if (!name || name.length > 100 || !workspaceName || workspaceName.length > 100) throw new Error("Local profile names must contain 1–100 characters");
  const env = process.env;
  return runWithDbEnv(env, async () => {
    await db.insert(instanceSettings).values({ id: "primary", instanceId: input.installationId, displayName: workspaceName }).onConflictDoNothing();
    const settings = await getInstanceAdministrationSettings(env);
    if (settings.instanceId !== input.installationId) throw new Error("Local installation identity does not match its database");
    if (!settings.bootstrapCompleted) {
      await bootstrapSelfHostedInstance(env, env.ZILOBASE_BOOTSTRAP_TOKEN!, {
        name, workspaceName, email: `local-${input.installationId}@local.invalid`, password: randomBytes(48).toString("hex"),
      });
    }
    const users = await db.select({ id: user.id }).from(user).limit(2);
    const workspaces = await db.select({ id: workspace.id }).from(workspace).limit(2);
    if (users.length !== 1 || workspaces.length !== 1) throw new Error("Local mode requires exactly one owner and workspace");
    const auth = await createAuth(env, new Request(env.BETTER_AUTH_URL!));
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(users[0]!.id, false, {
      activeWorkspaceId: workspaces[0]!.id, userAgent: "Zilobase Local Desktop",
    });
    if (!session) throw new Error("Unable to create local session");
    return { sessionToken: session.token, userId: users[0]!.id, workspaceId: workspaces[0]!.id };
  });
}
