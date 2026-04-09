terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "telemed"
      Environment = "demo"
      ManagedBy   = "terraform"
    }
  }
}

# We use the default VPC + its public subnets. ALB requires subnets in
# at least two AZs, default VPC always satisfies that.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}
