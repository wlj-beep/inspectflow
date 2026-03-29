# Gov-Cloud Notes

## Purpose
This note captures the differences that matter for BL-119 in sovereign US cloud environments.

## AWS GovCloud
- Use an AWS GovCloud account and the `aws-us-gov` partition.
- Region choices include `us-gov-west-1` and `us-gov-east-1`.
- Mirror the application images into a GovCloud registry before deployment.
- Keep the database, backup bucket, and ingress endpoints inside the same sovereign boundary.
- Prefer VPC endpoints and private connectivity for app-to-service traffic.
- Use IAM roles and KMS keys inside the GovCloud account instead of commercial-cloud credentials.
- Verify service availability in the target GovCloud region before committing to a design.

## Azure Government
- Use an Azure Government tenant/subscription, not a commercial Azure subscription.
- Region choices include US Gov Arizona, US Gov Texas, and US Gov Virginia; when required by policy, the DoD regions are separate sovereign regions.
- Prefer managed identities, Key Vault, and private endpoints.
- Keep the application images and backup targets inside the Azure Government boundary.
- Treat service parity as a checkable assumption, not a guarantee.

## Shared Guardrails
- Keep TLS termination inside the sovereign cloud boundary.
- Do not assume commercial-region service names, endpoints, or pricing apply.
- Use provider-native audit logging and monitor the backup path separately from the app path.
- Keep the same single-tenant shape as the commercial cloud baseline; only the control plane and endpoints change.

## Deployment Checklist
1. Validate the region and partition.
2. Validate the registry, database, and backup target are sovereign-cloud native.
3. Validate DNS, TLS, and certificate issuance inside the same boundary.
4. Validate the object-storage backup contract before enabling retention.
5. Validate the first-run admin checklist before exposing the public URL.
