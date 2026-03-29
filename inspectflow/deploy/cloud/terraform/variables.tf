variable "project_name" {
  type        = string
  description = "Short name for the InspectFlow cloud deployment."
  default     = "inspectflow"
}

variable "environment" {
  type        = string
  description = "Deployment environment name, such as dev, stage, or prod."
  default     = "prod"
}

variable "aws_region" {
  type        = string
  description = "AWS region for the deployment."
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC ID for the database and backup resources."
}

variable "db_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the database subnet group."
}

variable "allowed_ingress_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to reach the database."
  default     = []
}

variable "allowed_security_group_ids" {
  type        = list(string)
  description = "Security group IDs allowed to reach the database."
  default     = []
}

variable "backup_bucket_name" {
  type        = string
  description = "Optional explicit bucket name for object-storage backups."
  default     = ""
}

variable "backup_prefix" {
  type        = string
  description = "Object-storage prefix for backup artifacts."
  default     = "inspectflow"
}

variable "backup_retention_days" {
  type        = number
  description = "S3 lifecycle retention in days."
  default     = 14
}

variable "database_name" {
  type        = string
  description = "Database name used by the InspectFlow backend."
  default     = "inspectflow"
}

variable "database_username" {
  type        = string
  description = "Database user name for the InspectFlow backend."
  default     = "inspectflow"
}

variable "database_password" {
  type        = string
  description = "Database password for the InspectFlow backend."
  sensitive   = true
}

variable "database_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t4g.medium"
}

variable "database_engine_version" {
  type        = string
  description = "PostgreSQL engine version."
  default     = "16.4"
}

variable "database_allocated_storage_gb" {
  type        = number
  description = "Allocated RDS storage in GiB."
  default     = 50
}

variable "database_backup_retention_days" {
  type        = number
  description = "RDS automated backup retention window."
  default     = 7
}

variable "database_multi_az" {
  type        = bool
  description = "Enable Multi-AZ for the database."
  default     = false
}

variable "skip_final_snapshot" {
  type        = bool
  description = "Skip the final database snapshot when destroying."
  default     = true
}

variable "enable_deletion_protection" {
  type        = bool
  description = "Protect the database from accidental deletion."
  default     = false
}
