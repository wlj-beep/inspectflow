# Terraform Baseline

This Terraform layer provisions the cloud primitives under the BL-119 deployment baseline.

## Scope
- KMS keys for database and backup encryption
- S3 backup bucket with versioning and lifecycle retention
- PostgreSQL database instance and subnet/security groups

## Assumptions
- You already have a VPC and private database subnets.
- Kubernetes or another compute plane is handled separately by the Helm chart.
- A managed database is preferred over running PostgreSQL inside the app cluster.

## Workflow
1. Copy `terraform.tfvars.example` to a local tfvars file.
2. Fill in the VPC, subnet, CIDR, and password values.
3. Run:
   - `terraform init`
   - `terraform plan`
   - `terraform apply`

## Cloud Notes
- The `aws_region` variable can point at standard AWS or GovCloud regions.
- Keep the backup bucket private and encrypted.
- Use the outputs to populate Helm and object-storage backup env values.
