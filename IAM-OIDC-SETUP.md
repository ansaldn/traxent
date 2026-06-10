# AWS OIDC deploy role — one-time setup

This replaces long-lived AWS access keys for the backend and infra GitHub Actions. GitHub
presents a short-lived OIDC token; AWS lets it assume a role. **No access key or secret to
store or rotate.** The two backend workflows are already wired to it
(`role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}`).

Repo: `ansaldn/traxent` · Region: `eu-west-2`. Replace `<YOUR_AWS_ACCOUNT_ID>` below.

## Step 1 — Add the GitHub OIDC identity provider (once per AWS account)

Console → IAM → Identity providers → **Add provider** → OpenID Connect:
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

(The console fills the thumbprint automatically. If it already exists, skip this.)

## Step 2 — Create the deploy role

IAM → Roles → **Create role** → Custom trust policy → paste this **trust policy** (it limits the
role to *your* repo):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<YOUR_AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:ansaldn/traxent:*" }
      }
    }
  ]
}
```

> Tighter option: replace `repo:ansaldn/traxent:*` with `repo:ansaldn/traxent:ref:refs/heads/main`
> to allow only the `main` branch.

Then attach this **permissions policy** (inline). It covers both the SAM/infra deploy and the
Lambda/CloudFront code deploy. It's broad for convenience — fine to start, tighten later:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Cloudformation", "Effect": "Allow", "Action": "cloudformation:*", "Resource": "*" },
    { "Sid": "Lambda", "Effect": "Allow", "Action": "lambda:*", "Resource": "*" },
    { "Sid": "DynamoDB", "Effect": "Allow", "Action": "dynamodb:*", "Resource": "*" },
    { "Sid": "ApiGateway", "Effect": "Allow", "Action": "apigateway:*", "Resource": "*" },
    { "Sid": "CloudFront", "Effect": "Allow", "Action": [
        "cloudfront:DescribeFunction", "cloudfront:GetFunction", "cloudfront:UpdateFunction",
        "cloudfront:PublishFunction", "cloudfront:CreateInvalidation"
      ], "Resource": "*" },
    { "Sid": "Logs", "Effect": "Allow", "Action": "logs:*", "Resource": "*" },
    { "Sid": "S3ForSamArtifacts", "Effect": "Allow", "Action": "s3:*", "Resource": "*" },
    { "Sid": "IamForSamRoles", "Effect": "Allow", "Action": [
        "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:PassRole", "iam:TagRole",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
        "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies"
      ], "Resource": "*" }
  ]
}
```

Name it e.g. `traxent-github-deploy`. Copy its **ARN**
(`arn:aws:iam::<YOUR_AWS_ACCOUNT_ID>:role/traxent-github-deploy`).

## Step 3 — Tell GitHub the role ARN (a variable, not a secret)

GitHub repo → Settings → Secrets and variables → **Actions** → **Variables** tab → **New
repository variable**:
- Name: `AWS_DEPLOY_ROLE_ARN`
- Value: the role ARN from Step 2

(It's a *variable* because an ARN isn't sensitive. The workflows reference `${{ vars.AWS_DEPLOY_ROLE_ARN }}`.)

## Done

Push to `main` (or run the workflow manually). `deploy-backend.yml` and `deploy-infra.yml` now
assume the role with no stored keys.

**Note on the frontend deploy:** `deploy.yml` (S3 + CloudFront sync) still uses the existing
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` secrets, so it keeps working untouched. The role above
already includes `s3:*` + CloudFront, so when you're ready you can migrate it too — swap its
"Configure AWS credentials" step to `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}`, add the
`permissions: id-token: write / contents: read` block, then delete the old access keys.
