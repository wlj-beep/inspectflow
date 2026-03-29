locals {
  name_prefix       = "${var.project_name}-${var.environment}"
  backup_bucket_name = var.backup_bucket_name != "" ? var.backup_bucket_name : "${local.name_prefix}-backups"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Stack       = "cloud-saas-baseline"
  }
}

resource "aws_kms_key" "database" {
  description             = "${local.name_prefix} database encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "database" {
  name          = "alias/${local.name_prefix}-database"
  target_key_id  = aws_kms_key.database.key_id
}

resource "aws_kms_key" "backups" {
  description             = "${local.name_prefix} backup encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "backups" {
  name          = "alias/${local.name_prefix}-backups"
  target_key_id  = aws_kms_key.backups.key_id
}

resource "aws_s3_bucket" "backups" {
  bucket = local.backup_bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.backups.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-backups"
    status = "Enabled"

    filter {
      prefix = var.backup_prefix
    }

    expiration {
      days = var.backup_retention_days
    }
  }
}

resource "aws_db_subnet_group" "this" {
  name       = "${local.name_prefix}-db"
  subnet_ids = var.db_subnet_ids
  tags       = local.tags
}

resource "aws_security_group" "database" {
  name_prefix = "${local.name_prefix}-db-"
  description = "InspectFlow database ingress"
  vpc_id      = var.vpc_id
  tags        = local.tags

  dynamic "ingress" {
    for_each = toset(var.allowed_ingress_cidrs)
    content {
      description = "Database access from approved CIDR"
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  dynamic "ingress" {
    for_each = toset(var.allowed_security_group_ids)
    content {
      description     = "Database access from approved security group"
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "this" {
  identifier                  = "${local.name_prefix}-db"
  engine                      = "postgres"
  engine_version              = var.database_engine_version
  instance_class              = var.database_instance_class
  allocated_storage           = var.database_allocated_storage_gb
  storage_type                = "gp3"
  storage_encrypted           = true
  kms_key_id                  = aws_kms_key.database.arn
  db_name                     = var.database_name
  username                    = var.database_username
  password                    = var.database_password
  backup_retention_period     = var.database_backup_retention_days
  multi_az                    = var.database_multi_az
  publicly_accessible         = false
  skip_final_snapshot         = var.skip_final_snapshot
  deletion_protection         = var.enable_deletion_protection
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [aws_security_group.database.id]
  auto_minor_version_upgrade  = true
  apply_immediately           = false
  tags                        = local.tags

  copy_tags_to_snapshot = true
}
