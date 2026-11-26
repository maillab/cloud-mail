# XPass Mail Deployment Safety

This document describes the controlled deployment process for `mail.getxpass.net`. It applies to the Cloudflare Worker and the Vue assets in this repository.

## Source of truth

Before a release, the release owner must record:

- The Git commit being released.
- The branch and pull request that produced the commit.
- The Cloudflare account and Worker name selected for the release.
- The D1 database, KV namespace, R2 bucket, custom domain, and email binding selected for the release.
- The result of the production-version verification described below.

The local Visual Studio solution is not sufficient evidence of the deployed version. Verify the deployed Worker version and deployment timestamp in the Cloudflare dashboard, then compare the deployed commit metadata with the approved release commit.

## Normal application deployment

1. Open a pull request and obtain the required code review approvals.
2. Confirm that the release does not contain unreviewed database or binding changes.
3. Confirm that the production Cloudflare account and Worker are the intended target.
4. Confirm that the D1 and KV identifiers are existing, human-verified resources. The workflow fails if either identifier is absent; it does not discover or create resources.
5. Confirm the R2 bucket, Email binding, Assets binding, AI binding, custom domain, and cron configuration.
6. Confirm that the release has passed application validation in a non-production environment.
7. Run the `Deploy cloud-mail to Cloudflare Workers` workflow manually with `confirm_production` set to true.
8. Approve the protected `production` environment in GitHub Actions.
9. Review the workflow output without copying secrets, tokens, generated configuration, or private URLs into tickets or chat.
10. Perform the post-release validation checklist below.

Pushes to `main` do not start this deployment workflow. A deployment requires both the explicit workflow-dispatch confirmation and approval of the protected production environment.

## Cloudflare target verification

A human with access to the production Cloudflare account must verify, without publishing secret values:

- The account ID belongs to the XPass production account.
- The Worker name and custom domain are correct.
- The D1 database ID points to the production database, not a test or preview database.
- The KV namespace ID contains the production authentication and settings data.
- The R2 bucket is the production bucket and its access policy is understood.
- The Email binding forwards and receives mail for the intended domains.
- The Assets binding points to the release assets.
- The configured cron schedule is intentional.
- GitHub Actions uses protected secrets and the expected production environment.
- No unapproved preview or fork workflow can access production credentials.

Record only resource names, non-sensitive identifiers as permitted by company policy, and verification timestamps. Do not record secret values.

## Database migrations

Database migrations are separate from application deployment.

- The normal deployment workflow does not execute D1 SQL.
- The normal deployment workflow does not call `/api/init/<secret>`.
- The existing initialization and versioned schema code must not be used as an automatic deployment hook.
- Every migration requires its own reviewed change, a written impact assessment, and an identified rollback or restore procedure.
- A migration owner must inspect the current production schema before execution.
- A second reviewer must approve the exact SQL or migration change.
- The migration must be rehearsed against a current staging copy or representative schema.
- The migration must be executed only through an explicitly approved Cloudflare operation, never by adding a step to the normal deploy workflow.
- The migration result and affected schema version must be recorded without including data or credentials.

Destructive operations, column removal, table replacement, bulk updates, and data transformations require an additional data-owner approval and a tested restore plan. If a rollback is not technically possible, the migration must be additive or deferred.

## Backup requirements

Before any production migration:

- Create and verify a restorable D1 backup or export.
- Confirm the backup timestamp is after the last accepted release and before migration execution.
- Confirm R2 retention, versioning, or an equivalent attachment backup for any operation that changes object keys or access behavior.
- Confirm KV recovery expectations for authentication sessions and settings.
- Record who owns restoration and how the restoration will be verified.

No production migration should proceed when a verified restore path is unavailable.

## Release validation

Validate with a test account and a controlled mailbox after deployment:

- Login and logout.
- Session expiry and invalid-token behavior.
- Mail list and message detail.
- Compose and send.
- Receive and refresh.
- Attachments and permitted object access.
- Drafts, starred mail, folders, and templates where enabled.
- Account switching.
- Administrator-only pages using an approved administrator account.
- OAuth flows only if enabled for the release.
- Scheduled Worker configuration and email routing.
- Worker error rate and Cloudflare observability signals.

Do not use production customer or company data as a test payload. Stop validation and begin rollback if mail delivery, authentication, account isolation, or attachment access regresses.

## Rollback

For an application-only failure:

1. Stop further workflow dispatches.
2. Preserve the failed release commit and Cloudflare deployment details.
3. Deploy the last approved Worker version through the same protected, manually approved workflow.
4. Re-run the release validation checklist.
5. Notify the release owner and record the result.

A Worker rollback does not roll back a database migration. If a migration was involved, use the separately approved restore or forward-fix procedure. Never attempt an unreviewed destructive rollback against D1.

## Required human approvals

The following require explicit human approval:

- Creation or change of a production GitHub environment.
- Access to production Cloudflare credentials or secrets.
- Selection of production D1, KV, R2, Email, and custom-domain resources.
- Any D1 migration or data transformation.
- Any change to authentication, authorization, mail routing, or object access.
- Any production workflow dispatch.
- Any rollback involving database state or stored objects.

The deployment-safety change intentionally does not rotate credentials, alter production bindings, execute migrations, or deploy the Worker.
