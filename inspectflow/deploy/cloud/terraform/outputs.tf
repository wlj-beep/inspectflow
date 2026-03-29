output "backup_bucket_name" {
  description = "S3 bucket used for cloud backups."
  value       = aws_s3_bucket.backups.bucket
}

output "backup_bucket_arn" {
  description = "S3 bucket ARN used for cloud backups."
  value       = aws_s3_bucket.backups.arn
}

output "backup_prefix" {
  description = "Prefix under the bucket used for backup objects."
  value       = var.backup_prefix
}

output "database_endpoint" {
  description = "Database endpoint hostname."
  value       = aws_db_instance.this.address
}

output "database_port" {
  description = "Database endpoint port."
  value       = aws_db_instance.this.port
}

output "database_name" {
  description = "Database name."
  value       = var.database_name
}

output "database_user" {
  description = "Database user."
  value       = var.database_username
}

output "database_security_group_id" {
  description = "Security group ID attached to the database."
  value       = aws_security_group.database.id
}

output "database_url_template" {
  description = "Template for the application DATABASE_URL."
  value       = "postgresql://${var.database_username}:<password>@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${var.database_name}"
}

output "database_kms_key_arn" {
  description = "KMS key ARN used to encrypt the database."
  value       = aws_kms_key.database.arn
}

output "backup_kms_key_arn" {
  description = "KMS key ARN used to encrypt backup objects."
  value       = aws_kms_key.backups.arn
}
